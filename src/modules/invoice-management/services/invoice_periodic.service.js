const InvoicePeriodic = require("../models/invoice_periodic.model");
const Contract = require("../../contract-management/models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const MeterReading = require("../models/meterreading.model");
const BookService = require("../../contract-management/models/bookservice.model");
const Service = require("../../service-management/models/service.model");

// Hàm phụ trợ định dạng ngày chuẩn Việt Nam (DD/MM/YYYY)
const formatVN = (d) => {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

class InvoicePeriodicService {
  
  async getInvoices(query = {}) {
    return await InvoicePeriodic.find(query)
      .populate({
        path: "contractId",
        select: "contractCode roomId tenantId",
        populate: { path: "roomId", select: "name floorId" }
      })
      .sort({ createdAt: -1 });
  }

  async generateDraftInvoices() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const dueDate = new Date(year, month, 5); 

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

    const invoicesToCreate = contractsToCreate.map(contract => {
      const room = contract.roomId;
      
      let parsedPrice = room.roomTypeId ? (room.roomTypeId.currentPrice || 0) : 0;
      parsedPrice = typeof parsedPrice === 'object' && parsedPrice.$numberDecimal
        ? parseFloat(parsedPrice.$numberDecimal)
        : Number(parsedPrice) || 0;

      let totalAmount = 0;
      const invoiceItems = [];

      // ==============================================================
      // TÍNH TIỀN PHÒNG (GHI CHÚ MINH BẠCH, BỎ TAG ẨN)
      // ==============================================================
      if (contract.rentPaidUntil) {
        const rpuDate = new Date(contract.rentPaidUntil);
        rpuDate.setHours(0, 0, 0, 0);
        
        const eomDate = new Date(endOfMonth);
        eomDate.setHours(0, 0, 0, 0);
        
        const nextMonthFirstDay = new Date(year, month, 1);
        nextMonthFirstDay.setHours(0, 0, 0, 0);

        const cStartDate = new Date(contract.startDate);
        cStartDate.setHours(0,0,0,0);

        const cEndDate = new Date(contract.endDate);
        cEndDate.setHours(0, 0, 0, 0);

        if (cStartDate.getMonth() === (month - 1) && cStartDate.getFullYear() === year && cStartDate.getDate() !== 1) {
            let targetDate = eomDate;
            if (cEndDate < eomDate) {
                targetDate = cEndDate;
            }

            if (cStartDate <= targetDate) {
                const daysUsed = Math.round((targetDate - cStartDate) / (1000 * 60 * 60 * 24)) + 1;
                const pricePerDay = parsedPrice / daysInMonth;
                const roomRentAmount = pricePerDay * daysUsed;
                
                invoiceItems.push({
                  itemName: `Tiền thuê phòng (${daysUsed} ngày từ ${formatVN(cStartDate)} đến ${formatVN(targetDate)})`,
                  usage: daysUsed,
                  unitPrice: pricePerDay,
                  amount: roomRentAmount,
                  isIndex: false
                });
                totalAmount += roomRentAmount;
            }
        } 
        else {
            if (rpuDate <= nextMonthFirstDay) {
              let startCalc = new Date(rpuDate);
              startCalc.setDate(startCalc.getDate() + 1);
              startCalc.setHours(0, 0, 0, 0);
              
              if (startCalc > cEndDate) {
                  invoiceItems.push({
                    itemName: `Tiền thuê phòng (Hợp đồng đã kết thúc vào ${formatVN(cEndDate)}, không phát sinh tiền phòng)`,
                    usage: 1,
                    unitPrice: 0,
                    amount: 0,
                    isIndex: false
                  });
              } else {
                  let targetUntilDate = new Date(startCalc);
                  targetUntilDate.setMonth(targetUntilDate.getMonth() + 2); 
                  targetUntilDate.setDate(0); 
                  
                  if (targetUntilDate > cEndDate) {
                      targetUntilDate = new Date(cEndDate);
                      targetUntilDate.setHours(0, 0, 0, 0);
                      
                      let tempStart = new Date(startCalc);
                      let fullMonths = 0;
                      
                      while (true) {
                          let nextMonth = new Date(tempStart);
                          nextMonth.setMonth(nextMonth.getMonth() + 1);
                          let endOfCycle = new Date(nextMonth);
                          endOfCycle.setDate(endOfCycle.getDate() - 1);

                          if (endOfCycle <= targetUntilDate) {
                              fullMonths++;
                              tempStart = nextMonth;
                          } else {
                              break;
                          }
                      }
                      
                      const oddDays = targetUntilDate >= tempStart ? Math.round((targetUntilDate - tempStart) / (1000 * 60 * 60 * 24)) + 1 : 0;
                      const daysInTargetMonth = new Date(targetUntilDate.getFullYear(), targetUntilDate.getMonth() + 1, 0).getDate();
                      
                      const pricePerDay = parsedPrice / daysInTargetMonth;
                      const roomRentAmount = (fullMonths * parsedPrice) + (oddDays * pricePerDay);

                      let periodText = "";
                      if (fullMonths > 0 && oddDays > 0) {
                          periodText = `${fullMonths} tháng và ${oddDays} ngày lẻ`;
                      } else if (fullMonths > 0) {
                          periodText = `${fullMonths} tháng`;
                      } else {
                          periodText = `${oddDays} ngày lẻ`;
                      }

                      invoiceItems.push({
                        itemName: `Tiền thuê phòng (Đến cuối HĐ: ${periodText} từ ${formatVN(startCalc)} đến ${formatVN(targetUntilDate)})`,
                        usage: 1, 
                        unitPrice: roomRentAmount,
                        amount: roomRentAmount,
                        isIndex: false
                      });
                      totalAmount += roomRentAmount;
                  } else {
                      const roomRentAmount = parsedPrice * 2;
                      
                      invoiceItems.push({
                        // [QUAN TRỌNG] Chuỗi ngôn ngữ tự nhiên chứa ngày kết thúc
                        itemName: `Tiền thuê phòng trả trước 2 tháng (từ ${formatVN(startCalc)} đến ${formatVN(targetUntilDate)})`,
                        usage: 2,
                        unitPrice: parsedPrice,
                        amount: roomRentAmount,
                        isIndex: false
                      });
                      totalAmount += roomRentAmount;
                  }
              }
            } 
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
      // TÍNH DỊCH VỤ MỞ RỘNG
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

  // 4. XÁC NHẬN THANH TOÁN (Quét Regex thông minh từ chuỗi hiển thị)
  async markAsPaid(id) {
    const invoice = await InvoicePeriodic.findById(id);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn này.");
    if (invoice.status !== "Unpaid") throw new Error("Chỉ có thể xác nhận thanh toán cho hóa đơn đang ở trạng thái 'Chưa thu' (Unpaid).");

    const contract = await Contract.findById(invoice.contractId);
    if (contract) {
      let isContractUpdated = false;

      invoice.items.forEach(item => {
        // [ĐÃ SỬA]: Quét tìm cấu trúc "đến DD/MM/YYYY)" cực kỳ tự nhiên
        const match = item.itemName.match(/đến (\d{2})\/(\d{2})\/(\d{4})\)/);
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

  // 5. XEM CHI TIẾT
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