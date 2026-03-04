const Invoice = require("../models/invoice.model");
const Room = require("../../room-floor-management/models/room.model");
const MeterReading = require('../models/meterreading.model'); 
const BookService = require('../../service-management/models/bookservice.model'); 
const Service = require("../../service-management/models/service.model"); 
const Contract = require('../../contract-management/models/contract.model'); 

class InvoiceService {
  async getInvoices(query = {}) {
    return await Invoice.find(query).populate("roomId", "name floorId").sort({ createdAt: -1 });
  }

  async generateDraftInvoices() {
    const now = new Date();
    const month = now.getMonth() + 1; 
    const year = now.getFullYear();
    const dueDate = new Date(year, month, 5);

    const daysInMonth = new Date(year, month, 0).getDate();
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    // ==========================================
    // [FIX QUAN TRỌNG NHẤT]: TÌM PHÒNG DỰA TRÊN HỢP ĐỒNG, KHÔNG DỰA VÀO TRẠNG THÁI PHÒNG
    // (Bao được case phòng đã trả / chuyển đi giữa tháng thành trạng thái "Available")
    // ==========================================
    const activeContracts = await Contract.find({
      startDate: { $lte: endOfMonth },
      $or: [
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gte: startOfMonth } }
      ]
    });

    if (activeContracts.length === 0) {
      throw new Error("Không có hợp đồng nào hoạt động trong tháng này để tạo hóa đơn.");
    }

    // Lấy ra danh sách các phòng CÓ HỢP ĐỒNG trong tháng này (Dùng Set để tránh trùng lặp)
    const roomIdsFromContracts = [...new Set(activeContracts.map(c => c.roomId.toString()))];
    
    // Tìm thông tin của các phòng đó
    const activeRooms = await Room.find({ _id: { $in: roomIdsFromContracts } }).populate("roomTypeId"); 

    const titlePattern = `tháng ${month}/${year}`;
    const existingInvoices = await Invoice.find({
      type: "Periodic",
      title: { $regex: titlePattern, $options: "i" }
    });

    const roomIdsWithInvoice = existingInvoices.map(inv => inv.roomId.toString());

    // Lọc ra những phòng chưa tạo hóa đơn
    const roomsToCreate = activeRooms.filter(
      room => !roomIdsWithInvoice.includes(room._id.toString())
    );

    if (roomsToCreate.length === 0) {
      throw new Error(`Tất cả các phòng hợp lệ đều đã được tạo hóa đơn cho tháng ${month}/${year}.`);
    }

    const recentReadings = await MeterReading.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth }
    }).populate('utilityId'); 

    const elecService = await Service.findOne({ name: "Điện" });
    const waterService = await Service.findOne({ name: "Nước" });
    const missingRooms = [];

    // Bắt buộc tất cả các phòng (kể cả phòng khách đã chuyển đi giữa tháng) phải được chốt điện/nước
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
      throw new Error(`Bạn CHƯA CHỐT số Điện/Nước cho các phòng: ${displayRooms}. (Ghi chú: Nếu khách đã trả/chuyển phòng giữa tháng, bạn vẫn phải ghi chỉ số chốt của phòng đó trước khi tạo hóa đơn!)`);
    }

    const activeContractIds = activeContracts.map(c => c._id.toString());
    const activeServices = await BookService.find({
      contractId: { $in: activeContractIds }, 
      startDate: { $lte: endOfMonth }, 
      $or: [
        { endDate: null }, 
        { endDate: { $exists: false } },
        { endDate: { $gte: startOfMonth } } 
      ]
    }).populate('serviceId');

    const invoicesToCreate = roomsToCreate.map(room => {
      let parsedPrice = room.roomTypeId ? (room.roomTypeId.currentPrice || 0) : 0;
      parsedPrice = typeof parsedPrice === 'object' && parsedPrice.$numberDecimal 
        ? parseFloat(parsedPrice.$numberDecimal) 
        : Number(parsedPrice) || 0;

      let roomRentAmount = 0;
      let roomRentUsage = 0;
      let roomRentUnitPrice = parsedPrice;
      let roomRentItemName = "Tiền thuê phòng";

      // Tìm hợp đồng của phòng này (Lấy hợp đồng mới nhất nếu phòng có 2 hợp đồng trong tháng)
      const roomContract = activeContracts.slice().reverse().find(c => c.roomId.toString() === room._id.toString());

      if (roomContract) {
        const getStartOfDay = (dateInput) => {
          const d = new Date(dateInput);
          return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        };

        const cStart = getStartOfDay(roomContract.startDate);
        const cEnd = roomContract.endDate ? getStartOfDay(roomContract.endDate) : getStartOfDay(endOfMonth);
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
      }

      let totalAmount = roomRentAmount;
      const invoiceItems = [];
      
      if (roomRentUsage > 0) {
        invoiceItems.push({
          itemName: roomRentItemName,
          oldIndex: 0,
          newIndex: 0,
          usage: roomRentUsage,
          unitPrice: roomRentUnitPrice,
          amount: roomRentAmount 
        });
      }

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

      if (roomContract) {
        const contractServices = activeServices.filter(rs => rs.contractId.toString() === roomContract._id.toString());
        
        contractServices.forEach(rs => {
          if (rs.serviceId) {
            let srvPrice = rs.serviceId.currentPrice || rs.serviceId.price || 0;
            srvPrice = typeof srvPrice === 'object' && srvPrice.$numberDecimal 
              ? parseFloat(srvPrice.$numberDecimal) 
              : Number(srvPrice);

            let finalQty = rs.quantity || 1;
            let srvItemName = rs.serviceId.name || rs.serviceId.serviceName || "Dịch vụ";

            const amount = finalQty * srvPrice;
            totalAmount += amount;

            const displayItemName = rs.note ? `Dịch vụ ${srvItemName} (${rs.note})` : `Dịch vụ ${srvItemName}`;

            invoiceItems.push({
              itemName: displayItemName,
              oldIndex: 0,
              newIndex: 0,
              usage: finalQty,
              unitPrice: srvPrice, 
              amount: amount 
            });
          }
        });
      }

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

    const validInvoicesToCreate = invoicesToCreate.filter(inv => inv.items.length > 0 && inv.totalAmount > 0);

    if (validInvoicesToCreate.length === 0) {
      throw new Error(`Không có hóa đơn hợp lệ nào được tạo (Các phòng có thể chưa có hợp đồng trong tháng này).`);
    }

    const createdInvoices = await Invoice.insertMany(validInvoicesToCreate);
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
}

module.exports = new InvoiceService();