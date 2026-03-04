const Invoice = require("../models/invoice.model");
const Room = require("../../room-floor-management/models/room.model");
const MeterReading = require('../models/meterreading.model');
const BookService = require('../../service-management/models/bookservice.model');
const Service = require("../../service-management/models/service.model");
// [MỚI] Import model Contract
const Contract = require('../../contract-management/models/contract.model');

class InvoiceService {
  async getInvoices(query = {}) {
    return await Invoice.find(query).populate("roomId", "name floorId").sort({ createdAt: -1 });
  }

  // 1. CHỨC NĂNG: TẠO HÓA ĐƠN NHÁP HÀNG LOẠT (Tự động lấy tiền phòng + điện nước + dịch vụ)
  async generateDraftInvoices() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dueDate = new Date(year, month, 5);

    const activeRooms = await Room.find({ status: "Occupied" }).populate("roomTypeId");

    if (activeRooms.length === 0) {
      throw new Error("Không có phòng nào đang thuê để tạo hóa đơn.");
    }

    const titlePattern = `tháng ${month}/${year}`;
    const existingInvoices = await Invoice.find({
      type: "Periodic",
      title: { $regex: titlePattern, $options: "i" }
    });

    const roomIdsWithInvoice = existingInvoices.map(inv => inv.roomId.toString());

    const roomsToCreate = activeRooms.filter(
      room => !roomIdsWithInvoice.includes(room._id.toString())
    );

    if (roomsToCreate.length === 0) {
      throw new Error(`Tất cả các phòng đang thuê đều đã được tạo hóa đơn cho tháng ${month}/${year}.`);
    }

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const recentReadings = await MeterReading.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('utilityId');

    // ==========================================
    // BƯỚC 4.2: KIỂM TRA BẮT BUỘC ĐÃ CHỐT ĐIỆN NƯỚC CHƯA
    // ==========================================
    const elecService = await Service.findOne({ name: "Điện" });
    const waterService = await Service.findOne({ name: "Nước" });
    const missingRooms = [];

    roomsToCreate.forEach(room => {
      const roomReadings = recentReadings.filter(r => r.roomId.toString() === room._id.toString());
      let hasElec = true;
      let hasWater = true;

      if (elecService) {
        hasElec = roomReadings.some(r => r.utilityId && r.utilityId._id.toString() === elecService._id.toString());
      }
      if (waterService) {
        hasWater = roomReadings.some(r => r.utilityId && r.utilityId._id.toString() === waterService._id.toString());
      }

      if (!hasElec || !hasWater) {
        missingRooms.push(room.name);
      }
    });

    if (missingRooms.length > 0) {
      const displayRooms = missingRooms.length > 6 ? missingRooms.slice(0, 6).join(', ') + '...' : missingRooms.join(', ');
      throw new Error(`Bạn CHƯA CHỐT số Điện/Nước cho các phòng: ${displayRooms}. Vui lòng ghi chỉ số trước khi tạo hóa đơn!`);
    }

    // ==========================================
    // [ĐÃ SỬA] BƯỚC 4.3: LẤY CÁC DỊCH VỤ THEO HỢP ĐỒNG ĐANG ACTIVE
    // ==========================================
    // 1. Tìm tất cả hợp đồng ĐANG HIỆU LỰC trong tháng này
    const activeContracts = await Contract.find({
      startDate: { $lte: endOfMonth },
      $or: [
        { endDate: null },
        { endDate: { $gte: startOfMonth } },
        { status: 'active' } // Bắt điều kiện Hợp đồng còn hạn
      ]
    });

    const activeContractIds = activeContracts.map(c => c._id.toString());

    // 2. Tìm tất cả Dịch vụ (BookService) thuộc về các Hợp đồng trên
    const activeServices = await BookService.find({
      contractId: { $in: activeContractIds }, // <== Đổi roomId thành contractId
      startDate: { $lte: endOfMonth },
      $or: [
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gte: startOfMonth } }
      ]
    }).populate('serviceId');

    // Bước 5: Khởi tạo dữ liệu Hóa đơn Nháp
    const invoicesToCreate = roomsToCreate.map(room => {
      const roomPrice = room.roomTypeId ? (room.roomTypeId.currentPrice || 0) : 0;
      const parsedPrice = typeof roomPrice === 'object' && roomPrice.$numberDecimal
        ? parseFloat(roomPrice.$numberDecimal)
        : Number(roomPrice) || 0;

      let totalAmount = parsedPrice;
      const invoiceItems = [
        {
          itemName: "Tiền thuê phòng",
          oldIndex: 0,
          newIndex: 0,
          usage: 1,
          unitPrice: parsedPrice,
          amount: parsedPrice
        }
      ];

      // ==========================================
      // 5.3. CỘNG DỒN TIỀN ĐIỆN / NƯỚC 
      // ==========================================
      const roomReadings = recentReadings.filter(r => r.roomId.toString() === room._id.toString());
      const groupedReadings = {};

      roomReadings.forEach(reading => {
        const uId = reading.utilityId._id.toString();
        const usage = reading.newIndex - reading.oldIndex;

        if (usage >= 0 && reading.utilityId) {
          if (!groupedReadings[uId]) {
            groupedReadings[uId] = {
              utilityId: reading.utilityId,
              oldIndex: reading.oldIndex,
              newIndex: reading.newIndex,
              totalUsage: usage
            };
          } else {
            groupedReadings[uId].oldIndex = Math.min(groupedReadings[uId].oldIndex, reading.oldIndex);
            groupedReadings[uId].newIndex = Math.max(groupedReadings[uId].newIndex, reading.newIndex);
            groupedReadings[uId].totalUsage += usage;
          }
        }
      });

      Object.values(groupedReadings).forEach(group => {
        let servicePrice = group.utilityId.price || group.utilityId.currentPrice || 0;
        servicePrice = typeof servicePrice === 'object' && servicePrice.$numberDecimal
          ? parseFloat(servicePrice.$numberDecimal)
          : Number(servicePrice);

        const amount = group.totalUsage * servicePrice;
        totalAmount += amount;

        const serviceName = group.utilityId.name || group.utilityId.serviceName || "Dịch vụ";

        if (group.totalUsage > 0) {
          invoiceItems.push({
            itemName: `Tiền ${serviceName.toLowerCase()} (Cũ: ${group.oldIndex} - Mới: ${group.newIndex})`,
            oldIndex: group.oldIndex,
            newIndex: group.newIndex,
            usage: group.totalUsage,
            unitPrice: servicePrice,
            amount: amount
          });
        }
      });

      // ==========================================
      // [ĐÃ SỬA] 5.4. CỘNG DỒN TIỀN CÁC DỊCH VỤ PHỤ TỪ HỢP ĐỒNG
      // ==========================================
      // Lấy hợp đồng của phòng này
      const roomContract = activeContracts.find(c => c.roomId.toString() === room._id.toString());

      if (roomContract) {
        // Nếu phòng có Hợp đồng, tìm các dịch vụ thuộc về Hợp đồng đó
        const contractServices = activeServices.filter(rs => rs.contractId.toString() === roomContract._id.toString());

        contractServices.forEach(rs => {
          if (rs.serviceId) {
            let srvPrice = rs.serviceId.currentPrice || rs.serviceId.price || 0;
            srvPrice = typeof srvPrice === 'object' && srvPrice.$numberDecimal
              ? parseFloat(srvPrice.$numberDecimal)
              : Number(srvPrice);

            const qty = rs.quantity || 1;
            const amount = qty * srvPrice;
            totalAmount += amount;

            const srvName = rs.serviceId.name || rs.serviceId.serviceName || "Dịch vụ";
            const displayItemName = rs.note ? `Dịch vụ ${srvName} (${rs.note})` : `Dịch vụ ${srvName}`;

            invoiceItems.push({
              itemName: displayItemName,
              oldIndex: 0,
              newIndex: 0,
              usage: qty,
              unitPrice: srvPrice,
              amount: amount
            });
          }
        });
      }

      // 5.5. Trả về cấu trúc lưu DB
      return {
        invoiceCode: `INV-${room.name}-${month}${year}-${Math.floor(1000 + Math.random() * 9000)}`,
        roomId: room._id,
        title: `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`,
        type: "Periodic",
        items: invoiceItems,
        totalAmount: totalAmount,
        dueDate: dueDate,
        status: "Draft"
      };
    });

    const createdInvoices = await Invoice.insertMany(invoicesToCreate);
    return createdInvoices;
  }

  async releaseInvoice(id) {
    const invoice = await Invoice.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn");
    if (invoice.status !== "Draft") throw new Error("Chỉ có thể phát hành hóa đơn ở trạng thái Nháp (Draft)");

    invoice.status = "Unpaid";
    return await invoice.save();
  }

  async getInvoiceById(id) {
    const invoice = await Invoice.findById(id).populate("roomId", "name floorId");
    if (!invoice) {
      throw new Error("Không tìm thấy hóa đơn này.");
    }
    return invoice;
  }

  // Lấy hóa đơn theo TenantId (có phân trang)
  async getInvoicesByTenantId(tenantId, page = 1, limit = 10) {
    // Tính toán phân trang
    const skip = (page - 1) * limit;

    // Bước 1: Tìm tất cả contracts của tenant
    const contracts = await Contract.find({ tenantId, status: "active" }).select("roomId");

    if (contracts.length === 0) {
      return {
        invoices: [],
        pagination: {
          total: 0,
          page,
          limit,
          totalPages: 0,
        },
      };
    }

    // Bước 2: Lấy danh sách roomId từ contracts
    const roomIds = contracts.map(contract => contract.roomId);

    // Bước 3: Đếm tổng số hóa đơn
    const total = await Invoice.countDocuments({ roomId: { $in: roomIds } });

    // Bước 4: Lấy hóa đơn với phân trang
    const invoices = await Invoice.find({ roomId: { $in: roomIds } })
      .populate("roomId", "name floorId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return {
      invoices,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = new InvoiceService();