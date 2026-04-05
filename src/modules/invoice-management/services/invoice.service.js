const Invoice = require("../models/invoice.model");
const InvoiceIncurred = require("../models/invoice_incurred.model");
const Room = require("../../room-floor-management/models/room.model");
const MeterReading = require("../models/meterreading.model");
const BookService = require("../../contract-management/models/bookservice.model");
const Service = require("../../service-management/models/service.model");
const Contract = require("../../contract-management/models/contract.model");
const RepairRequest = require("../../request-management/models/repair_requests.model");
const Payment = require("../models/payment.model");

class InvoiceService {
  async getInvoices(query = {}) {
    return await Invoice.find(query)
      .populate("roomId", "name floorId")
      .sort({ createdAt: -1 })
      .lean();
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
        { endDate: null },
        { endDate: { $exists: false } },
        { endDate: { $gte: startOfMonth } },
      ],
    });

    if (activeContracts.length === 0) {
      throw new Error("Không có hợp đồng nào hoạt động trong tháng này để tạo hóa đơn.");
    }

    const roomIdsFromContracts = [...new Set(activeContracts.map((c) => c.roomId.toString()))];
    const activeRooms = await Room.find({ _id: { $in: roomIdsFromContracts } }).populate("roomTypeId");

    const titlePattern = `tháng ${month}/${year}`;
    const existingInvoices = await Invoice.find({
      type: "Periodic",
      title: { $regex: titlePattern, $options: "i" },
    });

    const roomIdsWithInvoice = existingInvoices.map((inv) => inv.roomId.toString());

    const roomsToCreate = activeRooms.filter((room) => !roomIdsWithInvoice.includes(room._id.toString()));

    if (roomsToCreate.length === 0) {
      throw new Error(`Tất cả các phòng hợp lệ đều đã được tạo hóa đơn cho tháng ${month}/${year}.`);
    }

    const recentReadings = await MeterReading.find({
      createdAt: { $gte: startOfMonth, $lte: endOfMonth },
    }).populate("utilityId");

    const elecService = await Service.findOne({ name: "Điện" });
    const waterService = await Service.findOne({ name: "Nước" });
    const missingRooms = [];

    roomsToCreate.forEach((room) => {
      const roomReadings = recentReadings.filter((r) => r.roomId.toString() === room._id.toString());
      let hasElec = true;
      let hasWater = true;

      if (elecService) {
        hasElec = roomReadings.some((r) => r.utilityId && r.utilityId._id.toString() === elecService._id.toString());
      }
      if (waterService) {
        hasWater = roomReadings.some((r) => r.utilityId && r.utilityId._id.toString() === waterService._id.toString());
      }

      if (!hasElec || !hasWater) {
        missingRooms.push(room.name);
      }
    });

    if (missingRooms.length > 0) {
      const displayRooms =
        missingRooms.length > 6 ? `${missingRooms.slice(0, 6).join(", ")}...` : missingRooms.join(", ");
      throw new Error(
        `Bạn CHƯA CHỐT số Điện/Nước cho các phòng: ${displayRooms}. (Ghi chú: Nếu khách đã trả/chuyển phòng giữa tháng, bạn vẫn phải ghi chỉ số chốt của phòng đó trước khi tạo hóa đơn!)`
      );
    }

    const activeContractIds = activeContracts.map((c) => c._id.toString());

    const activeBookServices = await BookService.find({
      contractId: { $in: activeContractIds },
    }).populate("services.serviceId");

    const invoicesToCreate = roomsToCreate.map((room) => {
      let parsedPrice = room.roomTypeId ? room.roomTypeId.currentPrice || 0 : 0;
      parsedPrice =
        typeof parsedPrice === "object" && parsedPrice.$numberDecimal
          ? parseFloat(parsedPrice.$numberDecimal)
          : Number(parsedPrice) || 0;

      let roomRentAmount = 0;
      let roomRentUsage = 0;
      let roomRentUnitPrice = parsedPrice;
      let roomRentItemName = "Tiền thuê phòng";

      const roomContract = activeContracts.slice().reverse().find((c) => c.roomId.toString() === room._id.toString());

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
          amount: roomRentAmount,
          isIndex: false,
        });
      }

      const roomReadings = recentReadings
        .filter((r) => r.roomId.toString() === room._id.toString())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const latestReadings = {};

      roomReadings.forEach((reading) => {
        const uId = reading.utilityId._id.toString();

        if (!latestReadings[uId]) {
          const usage = reading.newIndex - reading.oldIndex;
          if (usage >= 0 && reading.utilityId) {
            latestReadings[uId] = {
              utilityId: reading.utilityId,
              oldIndex: reading.oldIndex,
              newIndex: reading.newIndex,
              totalUsage: usage,
            };
          }
        }
      });

      Object.values(latestReadings).forEach((group) => {
        let servicePrice = group.utilityId.price || group.utilityId.currentPrice || 0;
        servicePrice =
          typeof servicePrice === "object" && servicePrice.$numberDecimal
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
            isIndex: true,
          });
        }
      });

      if (roomContract) {
        const contractBookService = activeBookServices.find(
          (bs) => bs.contractId.toString() === roomContract._id.toString()
        );

        if (contractBookService && contractBookService.services && contractBookService.services.length > 0) {
          contractBookService.services.forEach((srvItem) => {
            if (srvItem.endDate && new Date(srvItem.endDate) < startOfMonth) {
              return;
            }

            if (srvItem.serviceId) {
              let srvPrice = srvItem.serviceId.currentPrice || srvItem.serviceId.price || 0;
              srvPrice =
                typeof srvPrice === "object" && srvPrice.$numberDecimal
                  ? parseFloat(srvPrice.$numberDecimal)
                  : Number(srvPrice);

              const finalQty = srvItem.quantity || 1;
              const srvItemName = srvItem.serviceId.name || srvItem.serviceId.serviceName || "Dịch vụ";

              const nameCheck = srvItemName.toLowerCase().trim();
              if (nameCheck === "điện" || nameCheck === "dien" || nameCheck === "nước" || nameCheck === "nuoc") {
                return;
              }

              const amount = finalQty * srvPrice;
              totalAmount += amount;

              invoiceItems.push({
                itemName: `Dịch vụ ${srvItemName}`,
                oldIndex: 0,
                newIndex: 0,
                usage: finalQty,
                unitPrice: srvPrice,
                amount: amount,
                isIndex: false,
              });
            }
          });
        }
      }

      return {
        invoiceCode: `INV-${room.roomCode}-${month}${year}`,
        contractId: roomContract ? roomContract._id : null,
        roomId: room._id,
        title: `Hóa đơn tiền thuê & dịch vụ tháng ${month}/${year}`,
        type: "Periodic",
        items: invoiceItems,
        totalAmount: totalAmount,
        dueDate: dueDate,
        status: "Draft",
      };
    });

    const validInvoicesToCreate = invoicesToCreate.filter(
      (inv) => inv.items.length > 0 && inv.totalAmount > 0
    );

    if (validInvoicesToCreate.length === 0) {
      throw new Error(
        "Không có hóa đơn hợp lệ nào được tạo (Các phòng có thể chưa có hợp đồng trong tháng này)."
      );
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

  async markAsPaid(id) {
    const periodicInvoice = await Invoice.findById(id);
    if (periodicInvoice) {
      if (periodicInvoice.status !== "Unpaid") {
        throw new Error("Chỉ có thể xác nhận thanh toán cho hóa đơn đang ở trạng thái 'Chưa thu' (Unpaid)." );
      }

      periodicInvoice.status = "Paid";
      await periodicInvoice.save();
      return periodicInvoice;
    }

    const incurredInvoice = await InvoiceIncurred.findById(id);
    if (!incurredInvoice) {
      throw new Error("Không tìm thấy hóa đơn này.");
    }

    if (incurredInvoice.status !== "Unpaid") {
      throw new Error("Chỉ có thể xác nhận thanh toán cho hóa đơn đang ở trạng thái 'Chưa thu' (Unpaid)." );
    }

    incurredInvoice.status = "Paid";
    await incurredInvoice.save();

    if (incurredInvoice.repairRequestId) {
      await RepairRequest.findByIdAndUpdate(incurredInvoice.repairRequestId, { status: "Paid" });
    }

    return incurredInvoice;
  }

  async getInvoiceById(id) {
    const invoice = await Invoice.findById(id)
      .populate({
        path: "roomId",
        select: "name roomCode floorId roomTypeId",
        populate: [
          { path: "floorId", select: "name" },
          { path: "roomTypeId", select: "typeName currentPrice" },
        ],
      })
      .populate("contractId", "contractCode startDate endDate")
      .lean();

    if (invoice) {
      if (invoice.roomId?.roomTypeId?.currentPrice) {
        invoice.roomId.roomTypeId.currentPrice = parseFloat(
          invoice.roomId.roomTypeId.currentPrice.toString()
        );
      }

      const contract = await Contract.findOne({
        _id: invoice.contractId || invoice.roomId?._id,
        status: "active",
      })
        .select("tenantId contractCode startDate endDate")
        .populate("tenantId", "username email phoneNumber");

      return {
        ...invoice,
        tenant: contract?.tenantId || null,
        contractCode: invoice.contractId?.contractCode || contract?.contractCode || null,
      };
    }

    const incurredInvoice = await InvoiceIncurred.findById(id)
      .populate({
        path: "contractId",
        select: "contractCode startDate endDate roomId",
        populate: {
          path: "roomId",
          select: "name roomCode floorId roomTypeId",
          populate: [
            { path: "floorId", select: "name" },
            { path: "roomTypeId", select: "typeName currentPrice" },
          ],
        },
      })
      .lean();

    if (!incurredInvoice) {
      throw new Error("Không tìm thấy hóa đơn này.");
    }

    const contract = incurredInvoice.contractId;

    const tenantInfo = contract
      ? await Contract.findById(contract._id)
        .populate("tenantId", "username email phoneNumber")
        .then((c) => c?.tenantId || null)
      : null;

    return {
      ...incurredInvoice,
      type: "Incurred",
      roomId: contract?.roomId || null,
      tenant: tenantInfo,
      contractCode: contract?.contractCode || null,
      // Trích xuất số tháng đóng trước từ title (format: "Thanh toán tiền phòng trả trước (N tháng)")
      prepaidMonths: incurredInvoice.title
        ? parseInt(incurredInvoice.title.match(/\((\d+)\s*tháng\)/)?.[1] || "0", 10)
        : 0,
    };
  }

  async getInvoicesByTenantId(tenantId, page = 1, limit = 10) {
    const skip = (page - 1) * limit;

    const contracts = await Contract.find({ tenantId }).select("_id roomId");

    if (contracts.length === 0) {
      return {
        invoices: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const contractIds = contracts.map((contract) => contract._id);

    const periodicQuery = {
      contractId: { $in: contractIds },
      status: { $ne: "Draft" },
    };

    const incurredQuery = {
      contractId: { $in: contractIds },
      status: { $ne: "Draft" },
    };

    const [periodicTotal, incurredTotal] = await Promise.all([
      Invoice.countDocuments(periodicQuery),
      InvoiceIncurred.countDocuments(incurredQuery),
    ]);

    const total = periodicTotal + incurredTotal;

    const periodicInvoices = await Invoice.find(periodicQuery)
      .populate("roomId", "name floorId")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const incurredInvoices = await InvoiceIncurred.find(incurredQuery)
      .populate({
        path: "contractId",
        select: "roomId",
        populate: { path: "roomId", select: "name floorId" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const normalizedIncurred = incurredInvoices.map((inv) => ({
      ...inv,
      type: "Incurred",
      roomId: inv.contractId?.roomId || null,
    }));

    const invoices = [...periodicInvoices, ...normalizedIncurred].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return {
      invoices,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getMyInvoiceById(tenantId, invoiceId) {
    const contracts = await Contract.find({ tenantId }).select("_id roomId contractCode startDate endDate");
    if (contracts.length === 0) {
      throw new Error("Bạn không có hợp đồng thuê nào.");
    }

    const contractIds = contracts.map((c) => c._id.toString());
    const roomIds = contracts.map((c) => c.roomId.toString());

    const invoice = await Invoice.findById(invoiceId)
      .populate({
        path: "roomId",
        select: "name roomCode floorId roomTypeId",
        populate: [
          { path: "floorId", select: "name" },
          { path: "roomTypeId", select: "typeName currentPrice" },
        ],
      })
      .lean();

    if (invoice) {
      const hasContractAccess = invoice.contractId && contractIds.includes(invoice.contractId.toString());

      if (!hasContractAccess) {
        throw new Error("Bạn không có quyền xem hóa đơn này.");
      }

      if (invoice.roomId?.roomTypeId?.currentPrice) {
        invoice.roomId.roomTypeId.currentPrice = parseFloat(
          invoice.roomId.roomTypeId.currentPrice.toString()
        );
      }

      const contract = invoice.contractId
        ? contracts.find((c) => c._id.toString() === invoice.contractId.toString())
        : null;

      return {
        ...invoice,
        contractCode: contract?.contractCode || null,
        contractStartDate: contract?.startDate || null,
        contractEndDate: contract?.endDate || null,
      };
    }

    const incurredInvoice = await InvoiceIncurred.findById(invoiceId)
      .populate({
        path: "contractId",
        select: "roomId contractCode startDate endDate",
        populate: { path: "roomId", select: "name roomCode floorId roomTypeId" },
      })
      .lean();

    if (!incurredInvoice) {
      throw new Error("Không tìm thấy hóa đơn.");
    }

    const hasContractAccess =
      incurredInvoice.contractId && contractIds.includes(incurredInvoice.contractId._id.toString());
    const hasRoomAccess =
      incurredInvoice.contractId?.roomId &&
      roomIds.includes((incurredInvoice.contractId.roomId._id || incurredInvoice.contractId.roomId).toString());

    if (!hasContractAccess && !hasRoomAccess) {
      throw new Error("Bạn không có quyền xem hóa đơn này.");
    }

    return {
      ...incurredInvoice,
      type: "Incurred",
      roomId: incurredInvoice.contractId?.roomId || null,
      contractCode: incurredInvoice.contractId?.contractCode || null,
      contractStartDate: incurredInvoice.contractId?.startDate || null,
      contractEndDate: incurredInvoice.contractId?.endDate || null,
    };
  }

  async getIncurredInvoiceDetail(invoiceId) {
    const invoice = await InvoiceIncurred.findById(invoiceId)
      .select("invoiceCode title totalAmount status dueDate createdAt repairRequestId contractId")
      .populate({
        path: "contractId",
        select: "roomId",
        populate: { path: "roomId", select: "name" },
      })
      .lean();

    if (!invoice) throw new Error("Không tìm thấy hóa đơn.");
    if (!invoice.repairRequestId) throw new Error("Hóa đơn không liên kết với yêu cầu sửa chữa nào.");

    const repairRequest = await RepairRequest.findById(invoice.repairRequestId)
      .select("description devicesId")
      .populate({ path: "devicesId", select: "name" })
      .lean();

    if (!repairRequest) throw new Error("Không tìm thấy yêu cầu sửa chữa liên quan.");

    return {
      invoiceCode: invoice.invoiceCode,
      roomName: invoice.contractId?.roomId?.name || null,
      title: invoice.title,
      type: "Incurred",
      totalAmount: invoice.totalAmount,
      status: invoice.status,
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
      deviceName: repairRequest.devicesId?.name || null,
      description: repairRequest.description,
    };
  }

  async payIncurredInvoice(invoiceId) {
    const invoice = await InvoiceIncurred.findById(invoiceId);
    if (!invoice) throw new Error("Không tìm thấy hóa đơn.");
    if (invoice.status !== "Unpaid") {
      throw new Error(`Hóa đơn không ở trạng thái chờ thanh toán (trạng thái hiện tại: ${invoice.status}).`);
    }
    if (!invoice.repairRequestId) throw new Error("Hóa đơn không liên kết với yêu cầu sửa chữa nào.");

    const payment = new Payment({
      incurredInvoiceId: invoice._id,
      amount: invoice.totalAmount,
      status: "Success",
      paymentDate: new Date(),
    });
    await payment.save();

    invoice.status = "Paid";
    await invoice.save();

    await RepairRequest.findByIdAndUpdate(invoice.repairRequestId, { status: "Paid" });

    return {
      invoiceId: invoice._id,
      invoiceCode: invoice.invoiceCode,
      paymentId: payment._id,
      amount: payment.amount,
      paymentDate: payment.paymentDate,
      invoiceStatus: invoice.status,
    };
  }
}

module.exports = new InvoiceService();
