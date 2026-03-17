const InvoicePeriodic = require("../models/invoice_periodic.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const MeterReading = require("../models/meterreading.model");
const BookService = require("../../contract-management/models/bookservice.model");
const Service = require("../../service-management/models/service.model");

// Hàm phụ trợ định dạng ngày chuẩn Việt Nam (DD/MM/YYYY) để tránh lỗi lệch múi giờ
const formatVN = (d) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

class InvoicePeriodicService {
  
  // 1. LẤY DANH SÁCH HÓA ĐƠN
  async getInvoices(query = {}) {
    return await InvoicePeriodic.find(query)
      .populate({
        path: "contractId",
        select: "contractCode roomId tenantId",
        populate: { path: "roomId", select: "name floorId" }
      })
      .sort({ createdAt: -1 });
  }

  // 2. TẠO HÓA ĐƠN NHÁP ĐỊNH KỲ HÀNG THÁNG
  async generateDraftInvoices() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dueDate = new Date(year, month, 5); // Hạn đóng tiền mùng 5

    const daysInMonth = new Date(year, month, 0).getDate();
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const activeContracts = await Contract.find({
      startDate: { $lte: endOfMonth },
      $or: [
        { status: "active" },
        { 
          status: { $in: ["expired", "terminated"] }, 
          endDate: { $gte: startOfMonth } 
        }
      ]
    }).populate({
      path: "roomId",
      populate: { path: "roomTypeId" } 
    });

    if (activeContracts.length === 0) {
      throw new Error("Không có hợp đồng nào hoạt động trong tháng này để tạo hóa đơn.");
    }

    const titlePattern = `tháng ${month}/${year}`;
    const existingInvoices = await InvoicePeriodic.find({
      title: { $regex: titlePattern, $options: "i" }
    });

    const existingContractIds = existingInvoices.map(inv => inv.contractId.toString());

    const contractsToCreate = activeContracts.filter(
      contract => !existingContractIds.includes(contract._id.toString())
    );

    if (contractsToCreate.length === 0) {
      throw new Error(`Tất cả các hợp đồng hợp lệ đều đã được tạo hóa đơn cho tháng ${month}/${year}.`);
    }

    const roomIdsToCreate = [...new Set(contractsToCreate.map(c => c.roomId._id.toString()))];

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

    const activeContractIds = contractsToCreate.map(c => c._id.toString());
    const activeBookServices = await BookService.find({
      contractId: { $in: activeContractIds }
    }).populate('services.serviceId');

    // BẮT ĐẦU TÍNH TOÁN
    const invoicesToCreate = contractsToCreate.map(contract => {
      const room = contract.roomId;
      
      let parsedPrice = room.roomTypeId ? (room.roomTypeId.currentPrice || 0) : 0;
      parsedPrice = typeof parsedPrice === 'object' && parsedPrice.$numberDecimal
        ? parseFloat(parsedPrice.$numberDecimal)
        : Number(parsedPrice) || 0;

      let totalAmount = 0;
      const invoiceItems = [];

      // ==============================================================
      // TÍNH TIỀN PHÒNG (ĐÃ FIX LỖI BỎ QUA NGÀY LẺ THÁNG ĐẦU TIÊN)
      // ==============================================================
      if (contract.rentPaidUntil) {
        const rpuDate = new Date(contract.rentPaidUntil);
        rpuDate.setHours(0, 0, 0, 0);
        
        const eomDate = new Date(endOfMonth);
        eomDate.setHours(0, 0, 0, 0);
        
        const cStartDate = new Date(contract.startDate);
        cStartDate.setHours(0,0,0,0);

        // CASE 1: LÀ THÁNG ĐẦU TIÊN KÝ HỢP ĐỒNG VÀ KÝ GIỮA THÁNG (Tính ngày lẻ)
        if (cStartDate.getMonth() === (month - 1) && cStartDate.getFullYear() === year && cStartDate.getDate() !== 1) {
            
            const daysUsed = Math.round((eomDate - cStartDate) / (1000 * 60 * 60 * 24)) + 1;
            const pricePerDay = parsedPrice / daysInMonth;
            const roomRentAmount = pricePerDay * daysUsed;
            
            invoiceItems.push({
              itemName: `Tiền thuê phòng (Từ ${formatVN(cStartDate)} đến ${formatVN(eomDate)})`,
              usage: daysUsed,
              unitPrice: pricePerDay,
              amount: roomRentAmount,
              isIndex: false
            });
            totalAmount += roomRentAmount;
        } 
        // CASE 2: CÁC THÁNG BÌNH THƯỜNG KHÁC
        else {
            // NẾU ĐÃ ĐẾN HẠN TRẢ TIỀN (rpuDate <= eomDate) -> THU GỐI ĐẦU 2 THÁNG
            if (rpuDate <= eomDate) {
              let startCalc = new Date(rpuDate);
              startCalc.setDate(startCalc.getDate() + 1);
              startCalc.setHours(0, 0, 0, 0);
              
              let targetUntilDate = new Date(startCalc);
              targetUntilDate.setMonth(targetUntilDate.getMonth() + 2); // Chu kỳ thu 2 tháng
              targetUntilDate.setDate(0); // Lùi về ngày cuối tháng
              
              const roomRentAmount = parsedPrice * 2;
              
              const sm = startCalc.getMonth() + 1;
              const sy = startCalc.getFullYear();
              const em = targetUntilDate.getMonth() + 1;
              const ey = targetUntilDate.getFullYear();
  
              const periodStr = (sm === em && sy === ey) ? `Tháng ${sm}/${sy}` : `Tháng ${sm}/${sy} và Tháng ${em}/${ey}`;
  
              invoiceItems.push({
                itemName: `Tiền thuê phòng trả trước 2 tháng (${periodStr}) [Gia hạn đến ${formatVN(targetUntilDate)}]`,
                usage: 2,
                unitPrice: parsedPrice,
                amount: roomRentAmount,
                isIndex: false
              });
              totalAmount += roomRentAmount;
            } 
            // NẾU VẪN TRONG THỜI GIAN ĐÃ THANH TOÁN -> TIỀN PHÒNG = 0đ
            else {
              invoiceItems.push({
                itemName: `Tiền thuê phòng (Đã thanh toán trước đến ${formatVN(rpuDate)})`,
                usage: 1,
                unitPrice: 0,
                amount: 0,
                isIndex: false
              });
            }
        }
      } else {
        // Backup cho hợp đồng cũ chưa có rentPaidUntil
        invoiceItems.push({
          itemName: `Tiền thuê phòng (Hợp đồng chưa thiết lập mốc thanh toán)`,
          usage: 1,
          unitPrice: parsedPrice,
          amount: parsedPrice,
          isIndex: false
        });
        totalAmount += parsedPrice;
      }

      // ==============================================================
      // TÍNH ĐIỆN / NƯỚC BÌNH THƯỜNG
      // ==============================================================
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

      // ==============================================================
      // TÍNH DỊCH VỤ MỞ RỘNG (Rác, Wifi, Gửi xe...)
      // ==============================================================
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

      const randomSuffix = Math.floor(1000 + Math.random() * 9000);
      const invoiceCode = `INV-${contract.contractCode}-${month}${year}-${randomSuffix}`;

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

    // Cho phép tạo Hóa đơn 0đ để còn nhập số điện nước
    const validInvoicesToCreate = invoicesToCreate.filter(inv => inv.items.length > 0);

    if (validInvoicesToCreate.length === 0) {
      throw new Error(`Không có hóa đơn hợp lệ nào được tạo.`);
    }

    return await InvoicePeriodic.insertMany(validInvoicesToCreate);
  }

  // 3. PHÁT HÀNH HÓA ĐƠN
  async releaseInvoice(id) {
    const invoice = await InvoicePeriodic.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn");
    if (invoice.status !== "Draft") throw new Error("Chỉ có thể phát hành hóa đơn ở trạng thái Nháp (Draft)");

    invoice.status = "Unpaid";
    return await invoice.save();
  }

  // 4. XÁC NHẬN THANH TOÁN (KÈM AUTO-EXTEND NGÀY CHO HỢP ĐỒNG)
  async markAsPaid(id) {
    const invoice = await InvoicePeriodic.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn này.");
    if (invoice.status !== "Unpaid") throw new Error("Chỉ có thể xác nhận thanh toán cho hóa đơn đang ở trạng thái 'Chưa thu' (Unpaid).");

    // ĐỌC THÔNG TIN TỪ HÓA ĐƠN ĐỂ GIA HẠN NGÀY RENT_PAID_UNTIL CHO HỢP ĐỒNG
    const contract = await Contract.findById(invoice.contractId);
    if (contract) {
      let isContractUpdated = false;

      invoice.items.forEach(item => {
        const match = item.itemName.match(/\[Gia hạn đến (\d{2})\/(\d{2})\/(\d{4})\]/);
        if (match) {
          const dd = parseInt(match[1], 10);
          const mm = parseInt(match[2], 10) - 1; 
          const yyyy = parseInt(match[3], 10);
          
          const newDate = new Date(yyyy, mm, dd, 23, 59, 59);
          
          if (!contract.rentPaidUntil || newDate > new Date(contract.rentPaidUntil)) {
            contract.rentPaidUntil = newDate;
            isContractUpdated = true;
          }
        }
      });

      if (isContractUpdated) {
        await contract.save();
      }
    }

    invoice.status = "Paid";
    await invoice.save();
    return invoice;
  }

  // 5. XEM CHI TIẾT 1 HÓA ĐƠN
  async getInvoiceById(id) {
    const invoice = await InvoicePeriodic.findById(id)
      .populate({
        path: "contractId",
        select: "contractCode startDate endDate tenantId roomId rentPaidUntil",
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

    if (invoice.contractId?.roomId?.roomTypeId?.currentPrice) {
      invoice.contractId.roomId.roomTypeId.currentPrice = parseFloat(
        invoice.contractId.roomId.roomTypeId.currentPrice.toString()
      );
    }

    return {
      ...invoice,
      roomId: invoice.contractId?.roomId || null, 
      tenant: invoice.contractId?.tenantId || null,
      contractCode: invoice.contractId?.contractCode || null,
    };
  }

  // 6. LẤY HÓA ĐƠN THEO TENANT
  async getInvoicesByTenantId(tenantId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const contracts = await Contract.find({ tenantId }).select("_id");
    if (contracts.length === 0) {
      return { invoices: [], pagination: { total: 0, page, limit, totalPages: 0 } };
    }

    const contractIds = contracts.map(c => c._id);

    const query = {
      contractId: { $in: contractIds },
      status: { $ne: "Draft" } 
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

  // 7. KHÁCH THUÊ XEM CHI TIẾT
  async getMyInvoiceById(tenantId, invoiceId) {
    const contracts = await Contract.find({ tenantId }).select("_id");
    if (contracts.length === 0) throw new Error("Bạn không có hợp đồng thuê nào.");
    
    const contractIds = contracts.map(c => c._id.toString());

    const invoice = await this.getInvoiceById(invoiceId);

    if (!invoice.contractId || !contractIds.includes(invoice.contractId._id.toString())) {
      throw new Error("Bạn không có quyền xem hóa đơn này.");
    }

    return invoice;
  }
}

module.exports = new InvoicePeriodicService();