const InvoicePeriodic = require("../models/invoice_periodic.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const MeterReading = require("../models/meterreading.model");
const BookService = require("../../contract-management/models/bookservice.model");
const Service = require("../../service-management/models/service.model");

class InvoicePeriodicService {
  
  // 1. LẤY DANH SÁCH HÓA ĐƠN
  async getInvoices(query = {}) {
    return await InvoicePeriodic.find(query)
      .populate({
        path: "contractId",
        select: "contractCode roomId tenantId",
        populate: { path: "roomId", select: "name floorId" } // Truy xuất thông tin phòng thông qua hợp đồng
      })
      .sort({ createdAt: -1 });
  }

  // 2. TẠO HÓA ĐƠN NHÁP ĐỊNH KỲ HÀNG THÁNG
  async generateDraftInvoices() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dueDate = new Date(year, month, 5); // Hạn đóng tiền mùng 5 hàng tháng

    const daysInMonth = new Date(year, month, 0).getDate();
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // BƯỚC 1: Lấy danh sách Hợp đồng đang hoạt động trong tháng
    const activeContracts = await Contract.find({
      startDate: { $lte: endOfMonth },
      $or: [
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gte: startOfMonth } }
      ]
    }).populate({
      path: "roomId",
      populate: { path: "roomTypeId" } // Lấy kèm thông tin giá phòng
    });

    if (activeContracts.length === 0) {
      throw new Error("Không có hợp đồng nào hoạt động trong tháng này để tạo hóa đơn.");
    }

    // BƯỚC 2: Kiểm tra xem hợp đồng nào ĐÃ ĐƯỢC tạo hóa đơn trong tháng này rồi
    const titlePattern = `tháng ${month}/${year}`;
    const existingInvoices = await InvoicePeriodic.find({
      title: { $regex: titlePattern, $options: "i" }
    });

    const existingContractIds = existingInvoices.map(inv => inv.contractId.toString());

    // Lọc ra các hợp đồng CHƯA có hóa đơn
    const contractsToCreate = activeContracts.filter(
      contract => !existingContractIds.includes(contract._id.toString())
    );

    if (contractsToCreate.length === 0) {
      throw new Error(`Tất cả các hợp đồng hợp lệ đều đã được tạo hóa đơn cho tháng ${month}/${year}.`);
    }

    // Lấy ID phòng của các hợp đồng cần tạo để check điện nước
    const roomIdsToCreate = [...new Set(contractsToCreate.map(c => c.roomId._id.toString()))];

    // BƯỚC 3: Lấy chỉ số điện nước và kiểm tra chốt số
    const recentReadings = await MeterReading.find({
      roomId: { $in: roomIdsToCreate },
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('utilityId');

    const elecService = await Service.findOne({ name: "Điện" });
    const waterService = await Service.findOne({ name: "Nước" });
    const missingRooms = [];

    contractsToCreate.forEach(contract => {
      const room = contract.roomId;
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
      throw new Error(`Bạn CHƯA CHỐT số Điện/Nước cho các phòng: ${displayRooms}. Vui lòng chốt số trước khi tạo hóa đơn!`);
    }

    // Lấy dịch vụ mở rộng (BookService)
    const activeContractIds = contractsToCreate.map(c => c._id.toString());
    const activeBookServices = await BookService.find({
      contractId: { $in: activeContractIds }
    }).populate('services.serviceId');

    // BƯỚC 4: Bắt đầu tính toán và tạo mảng dữ liệu Hóa đơn
    const invoicesToCreate = contractsToCreate.map(contract => {
      const room = contract.roomId;
      
      let parsedPrice = room.roomTypeId ? (room.roomTypeId.currentPrice || 0) : 0;
      parsedPrice = typeof parsedPrice === 'object' && parsedPrice.$numberDecimal
        ? parseFloat(parsedPrice.$numberDecimal)
        : Number(parsedPrice) || 0;

      let roomRentAmount = 0;
      let roomRentUsage = 0;
      let roomRentUnitPrice = parsedPrice;
      let roomRentItemName = "Tiền thuê phòng";

      // Tính tiền phòng theo ngày (Proration)
      const getStartOfDay = (dateInput) => {
        const d = new Date(dateInput);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate());
      };

      const cStart = getStartOfDay(contract.startDate);
      const cEnd = contract.endDate ? getStartOfDay(contract.endDate) : getStartOfDay(endOfMonth);
      const monthStart = getStartOfDay(startOfMonth);
      const monthEnd = getStartOfDay(endOfMonth);

      const actualStart = cStart > monthStart ? cStart : monthStart;
      const actualEnd = cEnd < monthEnd ? cEnd : monthEnd;

      if (actualEnd >= actualStart) {
        let daysUsed = Math.round((actualEnd - actualStart) / (1000 * 60 * 60 * 24)) + 1;
        if (daysUsed > daysInMonth) daysUsed = daysInMonth;

        if (daysUsed === daysInMonth) {
          roomRentAmount = parsedPrice;
          roomRentUsage = 1;
        } else if (daysUsed > 0) {
          const pricePerDay = parsedPrice / daysInMonth;
          roomRentAmount = pricePerDay * daysUsed;
          roomRentUnitPrice = pricePerDay;
          roomRentUsage = daysUsed;
          roomRentItemName = `Tiền thuê phòng (${daysUsed}/${daysInMonth} ngày)`;
        }
      }

      let totalAmount = roomRentAmount;
      const invoiceItems = [];

      // Add item: Tiền phòng
      if (roomRentUsage > 0) {
        invoiceItems.push({
          itemName: roomRentItemName,
          oldIndex: 0,
          newIndex: 0,
          usage: roomRentUsage,
          unitPrice: roomRentUnitPrice,
          amount: roomRentAmount,
          isIndex: false 
        });
      }

      // Add item: Điện / Nước (Lấy bản ghi mới nhất)
      const roomReadings = recentReadings
        .filter(r => r.roomId.toString() === room._id.toString())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const latestReadings = {};
      roomReadings.forEach(reading => {
        const uId = reading.utilityId._id.toString();
        if (!latestReadings[uId]) {
          const usage = reading.newIndex - reading.oldIndex;
          if (usage >= 0 && reading.utilityId) {
            latestReadings[uId] = {
              utilityId: reading.utilityId,
              oldIndex: reading.oldIndex,
              newIndex: reading.newIndex,
              totalUsage: usage
            };
          }
        }
      });

      Object.values(latestReadings).forEach(group => {
        let servicePrice = group.utilityId.price || group.utilityId.currentPrice || 0;
        servicePrice = typeof servicePrice === 'object' && servicePrice.$numberDecimal
          ? parseFloat(servicePrice.$numberDecimal)
          : Number(servicePrice);

        const amount = group.totalUsage * servicePrice;
        totalAmount += amount;
        const serviceName = group.utilityId.name || group.utilityId.serviceName || "Dịch vụ";

        if (group.totalUsage > 0) {
          invoiceItems.push({
            itemName: `Tiền ${serviceName.toLowerCase()}`,
            oldIndex: group.oldIndex,
            newIndex: group.newIndex,
            usage: group.totalUsage,
            unitPrice: servicePrice,
            amount: amount,
            isIndex: true 
          });
        }
      });

      // Add item: Các dịch vụ mở rộng (Booked Services)
      const contractBookService = activeBookServices.find(bs => bs.contractId.toString() === contract._id.toString());
      if (contractBookService && contractBookService.services && contractBookService.services.length > 0) {
        contractBookService.services.forEach(srvItem => {
          if (srvItem.endDate && new Date(srvItem.endDate) < startOfMonth) return; 

          if (srvItem.serviceId) {
            let srvPrice = srvItem.serviceId.currentPrice || srvItem.serviceId.price || 0;
            srvPrice = typeof srvPrice === 'object' && srvPrice.$numberDecimal
              ? parseFloat(srvPrice.$numberDecimal)
              : Number(srvPrice);

            let finalQty = srvItem.quantity || 1;
            let srvItemName = srvItem.serviceId.name || srvItem.serviceId.serviceName || "Dịch vụ";

            const nameCheck = srvItemName.toLowerCase().trim();
            if (nameCheck === 'điện' || nameCheck === 'dien' || nameCheck === 'nước' || nameCheck === 'nuoc') return; 

            const amount = finalQty * srvPrice;
            totalAmount += amount;

            invoiceItems.push({
              itemName: `Dịch vụ ${srvItemName}`,
              oldIndex: 0,
              newIndex: 0,
              usage: finalQty,
              unitPrice: srvPrice,
              amount: amount,
              isIndex: false 
            });
          }
        });
      }

      const invoiceCode = `INV-${contract.contractCode}-${month}${year}`;

      return {
        invoiceCode: invoiceCode,
        contractId: contract._id,
        title: `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`,
        items: invoiceItems,
        totalAmount: totalAmount,
        dueDate: dueDate,
        status: "Draft"
      };
    });

    const validInvoicesToCreate = invoicesToCreate.filter(inv => inv.items.length > 0 && inv.totalAmount > 0);

    if (validInvoicesToCreate.length === 0) {
      throw new Error(`Không có hóa đơn hợp lệ nào được tạo.`);
    }

    const createdInvoices = await InvoicePeriodic.insertMany(validInvoicesToCreate);
    return createdInvoices;
  }

  // 3. PHÁT HÀNH HÓA ĐƠN
  async releaseInvoice(id) {
    const invoice = await InvoicePeriodic.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn");
    if (invoice.status !== "Draft") throw new Error("Chỉ có thể phát hành hóa đơn ở trạng thái Nháp (Draft)");

    invoice.status = "Unpaid";
    return await invoice.save();
  }

  // 4. XÁC NHẬN THANH TOÁN
  async markAsPaid(id) {
    const invoice = await InvoicePeriodic.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn này.");
    if (invoice.status !== "Unpaid") throw new Error("Chỉ có thể xác nhận thanh toán cho hóa đơn đang ở trạng thái 'Chưa thu' (Unpaid).");

    invoice.status = "Paid";
    await invoice.save();
    return invoice;
  }

  // 5. XEM CHI TIẾT 1 HÓA ĐƠN (Gắn kèm thông tin phòng từ Hợp đồng)
  async getInvoiceById(id) {
    const invoice = await InvoicePeriodic.findById(id)
      .populate({
        path: "contractId",
        select: "contractCode startDate endDate tenantId roomId",
        populate: [
          {
            path: "roomId",
            select: "name roomCode floorId roomTypeId",
            populate: [
              { path: "floorId", select: "name" },
              { path: "roomTypeId", select: "typeName currentPrice" }
            ]
          },
          { path: "tenantId", select: "username email phoneNumber" }
        ]
      })
      .lean();

    if (!invoice) throw new Error("Không tìm thấy hóa đơn này.");

    // Format lại giá trị Decimal128 nếu có
    if (invoice.contractId?.roomId?.roomTypeId?.currentPrice) {
      invoice.contractId.roomId.roomTypeId.currentPrice = parseFloat(
        invoice.contractId.roomId.roomTypeId.currentPrice.toString()
      );
    }

    // Mapping dữ liệu để trả về cấu trúc phẳng (Flatten) cho Frontend dễ xử lý
    return {
      ...invoice,
      roomId: invoice.contractId?.roomId || null, 
      tenant: invoice.contractId?.tenantId || null,
      contractCode: invoice.contractId?.contractCode || null,
    };
  }

  // 6. LẤY HÓA ĐƠN THEO TENANT (Dành cho màn hình App Khách Thuê)
  async getInvoicesByTenantId(tenantId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    // Tìm tất cả hợp đồng của khách thuê này
    const contracts = await Contract.find({ tenantId }).select("_id");
    if (contracts.length === 0) {
      return { invoices: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    const contractIds = contracts.map(c => c._id);

    const query = {
      contractId: { $in: contractIds },
      status: { $ne: "Draft" } // Khách không được xem bản Nháp
    };

    const total = await InvoicePeriodic.countDocuments(query);
    const invoices = await InvoicePeriodic.find(query)
      .populate({
        path: "contractId",
        select: "roomId contractCode",
        populate: { path: "roomId", select: "name floorId" }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Ánh xạ roomId ra ngoài để Frontend cũ không bị lỗi
    const formattedInvoices = invoices.map(inv => ({
      ...inv,
      roomId: inv.contractId?.roomId || null,
      contractCode: inv.contractId?.contractCode || null
    }));

    return {
      invoices: formattedInvoices,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // 7. KHÁCH THUÊ XEM CHI TIẾT HÓA ĐƠN CỦA MÌNH
  async getMyInvoiceById(tenantId, invoiceId) {
    const contracts = await Contract.find({ tenantId }).select("_id");
    if (contracts.length === 0) throw new Error("Bạn không có hợp đồng thuê nào.");
    
    const contractIds = contracts.map(c => c._id.toString());

    const invoice = await this.getInvoiceById(invoiceId); // Tận dụng lại hàm số 5

    // Bảo mật: Kiểm tra xem hóa đơn này có thuộc về 1 trong các hợp đồng của khách này không
    if (!invoice.contractId || !contractIds.includes(invoice.contractId._id.toString())) {
      throw new Error("Bạn không có quyền xem hóa đơn này.");
    }

    return invoice;
  }
}

module.exports = new InvoicePeriodicService();