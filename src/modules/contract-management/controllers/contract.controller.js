const Contract = require("../models/contract.model");
const BookService = require("../models/bookservice.model");
const Room = require("../../room-floor-management/models/room.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const Deposit = require("../models/deposit.model");
const InvoiceIncurred = require("../../invoice-management/models/invoice_incurred.model");
const InvoicePeriodic = require("../../invoice-management/models/invoice_periodic.model");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Ensure bcryptjs is installed

// Helper to generate random digit string (numbers only)
const generateRandomString = (length) => {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10).toString();
  }
  return result;
};

// Helper to generate Contract Code
// Format: HN/Room/Year/HDSV/Random3
const generateContractCode = (roomName) => {
  const year = new Date().getFullYear();
  const random3 = Math.floor(100 + Math.random() * 900); // 100-999
  return `HN/${roomName}/${year}/HDSV/${random3}`;
};

const {
  sendEmail,
} = require("../../notification-management/services/email.service");
const { EMAIL_TEMPLATES } = require("../../../shared/config/email");

exports.createContract = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      roomId,
      depositId, // Optional
      tenantInfo, // { fullName, dob, cccd, phone, email, address, ... }
      coResidents, // Array
      contractDetails, // { startDate, duration, services, paymentCycle, rentPaidUntil }
      bookServices, // NEW: array of { serviceId, name, price, type, category, quantity }
      rentPaidUntil, // Can be sent directly at root or inside contractDetails
    } = req.body;

    // 1. Validate Room Status (populate roomTypeId to get price)
    const room = await Room.findById(roomId)
      .populate("roomTypeId")
      .session(session);
    if (!room) throw new Error("Room not found");
    if (room.status !== "Available" && room.status !== "Deposited") {
      if (room.status === "Occupied")
        throw new Error("Room is currently occupied.");
    }

    // 1.2 Check for Future Contract if room is Deposited
    let futureContract = null;
    if (room.status === "Deposited") {
      futureContract = await Contract.findOne({
        roomId: room._id,
        status: "active",
        startDate: { $gt: new Date() }
      }).session(session).sort({ startDate: 1 });
    }

    // 1.5. Validate startDate: chỉ được tối đa 7 ngày từ khi bắt đầu cọc (nếu có deposit)
    if (depositId) {
      const deposit = await Deposit.findById(depositId).session(session);
      if (deposit) {
        const depositCreatedDate = new Date(deposit.createdAt);
        const maxStartDate = new Date(
          depositCreatedDate.getTime() + 7 * 24 * 60 * 60 * 1000,
        );
        const contractStartDate = new Date(contractDetails.startDate);

        if (contractStartDate > maxStartDate) {
           // We might want to bypass the 7-day rule here if we are creating a short-term rental.
           // However, let's keep it strictly for the deposit itself to be valid.
           // Bypassing it could allow indefinitely expired deposits to be used.
        }
      }
    }

    // 1.8 Validate Short-term Rental (if future contract exists)
    const newContractEndDate = new Date(contractDetails.startDate);
    newContractEndDate.setMonth(newContractEndDate.getMonth() + contractDetails.duration);
    
    if (futureContract) {
      const futureStartDate = new Date(futureContract.startDate);
      // The new rental MUST end before the future contract starts
      if (newContractEndDate >= futureStartDate) {
        throw new Error(
          `Phòng đã có người cọc trước. Thời hạn thuê của bạn kết thúc vào ngày ${newContractEndDate.toLocaleDateString("vi-VN")} vượt quá ngày bắt đầu của khách kế tiếp (${futureStartDate.toLocaleDateString("vi-VN")}). Vui lòng giảm thời hạn thuê xuống.`
        );
      }
    }

    // Get room price and deposit from roomType
    const roomPrice = parseFloat(
      room.roomTypeId?.currentPrice?.toString() || "0",
    );
    const depositAmount = roomPrice; // Deposit = 1 month rent

    // Validate co-residents count <= personMax from roomType
    const personMax = room.roomTypeId?.personMax || 1;
    const totalPeople = (coResidents ? coResidents.length : 0) + 1; // Tenant + Co-residents
    if (totalPeople > personMax) {
      throw new Error(
        `Số người ở (${totalPeople}) vượt quá giới hạn của loại phòng (tối đa ${personMax} người).`,
      );
    }

    // Compute days until contract start (used for both tenant status & room status)
    const todayForCalc = new Date();
    todayForCalc.setHours(0, 0, 0, 0);
    const startDateObj = new Date(contractDetails.startDate);
    startDateObj.setHours(0, 0, 0, 0);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysUntilStart = Math.ceil((startDateObj - todayForCalc) / msPerDay);

    // Nếu startDate > 30 ngày → hợp đồng inactive, user inactive, chưa activate
    // Nếu startDate <= 30 ngày (đã đến hoặc < 30 ngày nữa) → hợp đồng active, user active, đã activate
    const isFutureLong = daysUntilStart > 30;
    const tenantInitialStatus = isFutureLong ? "inactive" : "active";
    const contractIsActivated = !isFutureLong;
    const contractInitialStatus = isFutureLong ? "inactive" : "active";

    // 2. Handle Tenant Account
    // Check by CCCD first (primary identity document in VN)
    let isNewUser = false;
    let passwordRaw = null;
    let user = null;

    const existingUserInfo = tenantInfo.cccd
      ? await UserInfo.findOne({ cccd: tenantInfo.cccd }).session(session)
      : null;

    if (existingUserInfo) {
      user = await User.findById(existingUserInfo.userId).session(session);
      if (!user) {
        // User account bị xóa khỏi hệ thống → tạo mới User, reuse UserInfo cũ
        isNewUser = true;
        console.log(`[CREATE CONTRACT] UserInfo exists but User deleted. Creating new account for CCCD=${tenantInfo.cccd}`);
      } else if (user.status === "inactive") {
        // User account đang inactive (hợp đồng cũ đã thanh lý) → tạo tài khoản mới, reuse UserInfo cũ
        isNewUser = true;
        console.log(`[CREATE CONTRACT] Found inactive account for CCCD=${tenantInfo.cccd}. Creating new account, reusing existing UserInfo.`);
      } else {
        // User account đang active → reuse như cũ
        isNewUser = false;
        console.log(`[CREATE CONTRACT] Existing active User found by CCCD: ID=${user._id}, cccd=${tenantInfo.cccd}`);
      }
    } else {
      // CCCD chưa tồn tại → tạo tài khoản mới ngay
      isNewUser = true;
      console.log(`[CREATE CONTRACT] CCCD=${tenantInfo.cccd} not found. Creating new account.`);
    }

    if (isNewUser) {
      passwordRaw = generateRandomString(8);
      const hashedPassword = await bcrypt.hash(passwordRaw, 10);

      // Generate Username: email prefix
      let finalUsername = tenantInfo.email.split("@")[0];

      // Ensure username is unique
      let existingUserByUsername = await User.findOne({
        username: finalUsername,
      }).session(session);

      let tempUsername = finalUsername;
      while (existingUserByUsername) {
        tempUsername = `${finalUsername}${Math.floor(100 + Math.random() * 900)}`;
        existingUserByUsername = await User.findOne({
          username: tempUsername,
        }).session(session);
      }
      finalUsername = tempUsername;

      console.log(
        `[CREATE USER] Creating new Tenant: email=${tenantInfo.email}, phone=${tenantInfo.phone}, username=${finalUsername}`,
      );

      user = new User({
        username: finalUsername,
        email: tenantInfo.email,
        phoneNumber: tenantInfo.phone,
        password: hashedPassword,
        role: "Tenant",
        status: tenantInitialStatus,
      });
      await user.save({ session });
      console.log(`[CREATE USER] ✅ New Tenant created with ID: ${user._id}`);

      if (existingUserInfo) {
        // UserInfo đã tồn tại (CCCD cũ) → cập nhật liên kết userId mới
        existingUserInfo.userId = user._id;
        existingUserInfo.fullname = tenantInfo.fullName;
        existingUserInfo.address = tenantInfo.address;
        existingUserInfo.dob = tenantInfo.dob;
        existingUserInfo.gender = tenantInfo.gender || "Other";
        await existingUserInfo.save({ session });
        console.log(`[CREATE USER] ✅ Reused existing UserInfo for CCCD=${tenantInfo.cccd}, linked to new user=${user._id}`);
      } else {
        // Tạo UserInfo hoàn toàn mới
        const userInfo = new UserInfo({
          userId: user._id,
          fullname: tenantInfo.fullName,
          cccd: tenantInfo.cccd,
          address: tenantInfo.address,
          dob: tenantInfo.dob,
          gender: tenantInfo.gender || "Other",
        });
        await userInfo.save({ session });
      }
    }

    // 3. Find the Deposit linked to this room (status = "Held")
    // Priority: activationStatus=null (new, for future contract) > activationStatus=false (reset old deposit) > activationStatus=true (already active)
    // Skip deposits already linked to any existing contract (to prevent mixing deposits between contracts)
    let linkedDepositId = depositId || null;
    if (!linkedDepositId && room.status === "Deposited") {
      // Get all contracts for this room (any status) to find which deposits are already taken
      const allRoomContracts = await Contract.find({
        roomId: room._id,
      }).session(session);

      const takenDepositIds = allRoomContracts
        .filter(c => c.depositId)
        .map(c => c.depositId.toString());

      const heldDeposits = await Deposit.find({
        room: room._id,
        status: "Held",
      }).session(session);

      if (heldDeposits.length > 0) {
        // Step 1: Find deposit NOT linked to any existing contract AND with activationStatus=null (newest, for future contract)
        const newFreeDeposit = heldDeposits.find(
          d => !takenDepositIds.includes(d._id.toString()) && d.activationStatus === null
        );

        if (newFreeDeposit) {
          linkedDepositId = newFreeDeposit._id;
        } else {
          // Step 2: Find deposit NOT linked to any existing contract AND with activationStatus=false (reset old)
          const resetFreeDeposit = heldDeposits.find(
            d => !takenDepositIds.includes(d._id.toString()) && d.activationStatus === false
          );

          if (resetFreeDeposit) {
            linkedDepositId = resetFreeDeposit._id;
          } else {
            // Step 3: Find deposit NOT linked to any existing contract (any status)
            const anyFreeDeposit = heldDeposits.find(
              d => !takenDepositIds.includes(d._id.toString())
            );

            if (anyFreeDeposit) {
              linkedDepositId = anyFreeDeposit._id;
            } else {
              // Fallback: all deposits are taken → user must explicitly select a deposit
              linkedDepositId = null;
            }
          }
        }
      }
    }

    // 3.5. Update linked deposit's activationStatus
    // - Nếu hợp đồng đã active (startDate <= today): activationStatus = true
    // - Nếu hợp đồng chưa active (startDate > today): activationStatus = null (chờ ngày kích hoạt)
    if (linkedDepositId) {
      const linkedDeposit = await Deposit.findById(linkedDepositId).session(session);
      if (linkedDeposit) {
        if (contractIsActivated) {
          linkedDeposit.activationStatus = true;
        } else {
          linkedDeposit.activationStatus = null; // Chưa active, chờ đến ngày
        }
        await linkedDeposit.save({ session });
      }
    }

    // 4. Create Contract Record
    const endDate = new Date(contractDetails.startDate);
    endDate.setMonth(endDate.getMonth() + contractDetails.duration);

    const newContract = new Contract({
      contractCode: generateContractCode(room.name),
      roomId: room._id,
      tenantId: user._id,
      depositId: linkedDepositId,
      coResidents,
      startDate: contractDetails.startDate,
      endDate: endDate,
      rentPaidUntil: rentPaidUntil || contractDetails.rentPaidUntil || null,
      duration: contractDetails.duration,
      status: contractInitialStatus,
      isActivated: contractIsActivated,
      images: req.body.images || [],
    });

    await newContract.save({ session });

    // 4.1. Update linked deposit's contractId (liên kết deposit → contract)
    if (linkedDepositId) {
      await Deposit.findByIdAndUpdate(
        linkedDepositId,
        { contractId: newContract._id },
        { session }
      );
    }

    // 4.2. Create BookService record (1 document per contract, array of services)
    if (bookServices && bookServices.length > 0) {
      const contractStartDate = new Date(contractDetails.startDate);
      const bookServiceRecord = new BookService({
        contractId: newContract._id,
        services: bookServices.map((s) => ({
          serviceId: s.serviceId,
          quantity: s.quantity && s.quantity > 0 ? s.quantity : 1,
          startDate: contractStartDate,
          endDate: null,
        })),
      });
      await bookServiceRecord.save({ session });
    }

    // 4.5 Create prepaid invoice if prepayMonths is provided
    const prepayMonths = req.body.prepayMonths ? Number(req.body.prepayMonths) : 0;
    if (prepayMonths > 0) {
      const totalAmount = prepayMonths * roomPrice;
      const date = new Date();
      const datePrefix = `${String(date.getDate()).padStart(2, '0')}${String(date.getMonth() + 1).padStart(2, '0')}${date.getFullYear()}`;
      const nextSeq = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
      const invoiceCode = `HD-PREPAID-${datePrefix}-${nextSeq}`;

      // Calculate due date based on prepay months (each month is prepaid, so due date is the end of the last prepaid month)
      const contractStartDateObj = new Date(contractDetails.startDate);
      const dueDate = new Date(contractStartDateObj);
      dueDate.setMonth(dueDate.getMonth() + prepayMonths);
      dueDate.setDate(0); // Go to last day of previous month

      const prepaidInvoice = new InvoicePeriodic({
        invoiceCode,
        contractId: newContract._id,
        title: `Thanh toán tiền phòng trả trước (${prepayMonths} tháng)`,
        items: [
          {
            itemName: "Tiền thuê phòng",
            oldIndex: 0,
            newIndex: 0,
            usage: prepayMonths,
            unitPrice: roomPrice,
            amount: totalAmount,
            isIndex: false,
          }
        ],
        totalAmount,
        status: "Paid",
        dueDate,
      });
      await prepaidInvoice.save({ session });
    }

    // 5. Update Room Status
    // Nếu hợp đồng bắt đầu ngay hôm nay hoặc trong quá khứ -> Occupied
    // Nếu bắt đầu trong tương lai (chưa đến ngày active) -> Deposited
    if (daysUntilStart <= 0) {
      room.status = "Occupied";
    } else {
      room.status = "Deposited";
    }
    await room.save({ session });
    // else: keep room as Deposited, cron job will update on startDate

    // 5. Deposit remains "Held" status when linked to a contract (no status change needed)

    await session.commitTransaction();
    session.endSession();

    // 6. Send Email Notification to the tenant's email from the form (NOT user.email from DB)
    if (isNewUser) {
      const recipientEmail = tenantInfo.email;
      console.log(`[DEBUG] Preparing to send email to ${recipientEmail}`);
      const emailContent = EMAIL_TEMPLATES.NEW_CONTRACT_ACCOUNT.getHtml(
        tenantInfo.fullName,
        user.username,
        passwordRaw,
        room.name,
      );

      try {
        await sendEmail(
          recipientEmail,
          EMAIL_TEMPLATES.NEW_CONTRACT_ACCOUNT.subject,
          emailContent,
        );
        console.log(`✅ [DEBUG] Email successfully sent to ${recipientEmail}`);
      } catch (emailError) {
        console.error(
          `❌ [DEBUG] Failed to send email to ${user.email}:`,
          emailError,
        );
        // We don't throw here to ensure the contract creation success is still returned,
        // but we might want to warn the user in the response if critical.
      }
    } else {
      console.log(`[DEBUG] User existing. Skipping new account email.`);
    }

    const successMsg = isNewUser
      ? (tenantInitialStatus === "inactive"
          ? `Đã tạo hợp đồng thành công. Tài khoản đã tạo nhưng sẽ được kích hoạt vào ngày ${startDateObj.toLocaleDateString("vi-VN")}. Mật khẩu đã gửi email.`
          : "Đã tạo hợp đồng thành công. Tài khoản và mật khẩu đã được gửi đến email."
        )
      : "Tài khoản cho số điện thoại/email này đã tồn tại nên không tạo mới, hợp đồng đã được tạo thành công!";

    res.status(201).json({
      success: true,
      message: successMsg,
      data: {
        isNewUser,
        contract: newContract,
        account: isNewUser ? {
          username: user.username,
          password: passwordRaw,
        } : null,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Create Contract Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getAllContracts = async (req, res) => {
  try {
    const contracts = await Contract.find()
      .populate({
        path: "roomId",
        select: "name customId status roomTypeId",
        populate: { path: "roomTypeId", select: "typeName currentPrice" },
      })
      .populate("tenantId", "username email phoneNumber")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: contracts.length,
      data: contracts,
    });
  } catch (error) {
    console.error("Get All Contracts Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

exports.getContractById = async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate({
        path: "roomId",
        select: "name roomCode status roomTypeId floorId",
        populate: [
          { path: "roomTypeId", select: "typeName currentPrice personMax" },
          { path: "floorId", select: "name" },
        ],
      })
      .populate("tenantId", "username email phoneNumber")
      .populate("depositId", "name phone email amount status createdAt");

    if (!contract) {
      return res
        .status(404)
        .json({ success: false, message: "Contract not found" });
    }

    // Fetch tenant's UserInfo separately
    const tenantInfo = await UserInfo.findOne({
      userId: contract.tenantId._id,
    });

    // Fetch BookService for this contract (with populated service names/prices)
    const bookServiceRecord = await BookService.findOne({
      contractId: contract._id,
    }).populate("services.serviceId", "name currentPrice type description");

    // Fetch room assets/devices
    const RoomDevice = require("../../room-floor-management/models/roomdevices.model");
    const roomAssets = await RoomDevice.find({
      roomTypeId: contract.roomId?.roomTypeId?._id,
    }).populate("deviceId", "name brand model unit");

    // Convert to plain object and fix Decimal128 fields
    const contractData = contract.toObject();

    // Fix roomType currentPrice (Decimal128 → Number)
    if (contractData.roomId?.roomTypeId?.currentPrice) {
      contractData.roomId.roomTypeId.currentPrice = parseFloat(
        contractData.roomId.roomTypeId.currentPrice.toString(),
      );
    }
    // Fix service currentPrice (Decimal128 → Number)
    if (contractData.services) {
      contractData.services = contractData.services.map((s) => ({
        ...s,
        currentPrice: s.currentPrice
          ? parseFloat(s.currentPrice.toString())
          : 0,
      }));
    }

    // Map bookServices with populated data
    const bookServices = bookServiceRecord
      ? bookServiceRecord.services.map((s) => ({
        serviceId: s.serviceId?._id,
        name: s.serviceId?.name || "—",
        currentPrice: s.serviceId?.currentPrice
          ? parseFloat(s.serviceId.currentPrice.toString())
          : 0,
        type: s.serviceId?.type || "",
        quantity: s.quantity || null,
      }))
      : [];

    // Map room assets
    const assets = roomAssets.map((a) => ({
      deviceId: a.deviceId,
      quantity: a.quantity,
      condition: a.condition,
    }));

    res.status(200).json({
      success: true,
      data: {
        ...contractData,
        tenantInfo: tenantInfo ? tenantInfo.toObject() : null,
        bookServices,
        assets,
      },
    });
  } catch (error) {
    console.error("Get Contract By ID Error:", error);
    res.status(500).json({
      success: false,
      message: "Server Error",
    });
  }
};

// Tenant xem hợp đồng của mình
exports.getMyContracts = async (req, res) => {
  try {
    const tenantId = req.user?.userId;
    if (!tenantId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized - Không tìm thấy thông tin người dùng",
      });
    }

    const contracts = await Contract.find({ tenantId })
      .populate({
        path: "roomId",
        select: "name roomCode status roomTypeId floorId",
        populate: [
          {
            path: "roomTypeId",
            select: "typeName currentPrice personMax description images",
          },
          { path: "floorId", select: "name" },
        ],
      })
      .populate("depositId", "name phone email room amount status createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // Lấy BookService cho tất cả hợp đồng cùng lúc
    const contractIds = contracts.map((c) => c._id);
    const bookServices = await BookService.find({
      contractId: { $in: contractIds },
    })
      .populate({
        path: "services.serviceId",
        select: "name currentPrice type description",
      })
      .lean();

    // Map bookService theo contractId để lookup nhanh
    const bookServiceMap = {};
    for (const bs of bookServices) {
      bookServiceMap[bs.contractId.toString()] = bs.services || [];
    }

    // Fix Decimal128 và gắn services
    const data = contracts.map((c) => {
      if (c.roomId?.roomTypeId?.currentPrice) {
        c.roomId.roomTypeId.currentPrice = parseFloat(
          c.roomId.roomTypeId.currentPrice.toString(),
        );
      }

      // Gắn services từ BookService
      const rawServices = bookServiceMap[c._id.toString()] || [];
      c.services = rawServices.map((item) => {
        const svc = item.serviceId || {};
        return {
          _id: svc._id,
          name: svc.name,
          currentPrice: svc.currentPrice
            ? parseFloat(svc.currentPrice.toString())
            : 0,
          type: svc.type,
          description: svc.description,
          quantity: item.quantity ?? 1,
        };
      });

      // Include rentPaidUntil field for tenant to see payment date
      c.rentPaidUntil = c.rentPaidUntil || null;

      return c;
    });

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Get My Contracts Error:", error);
    res
      .status(500)
      .json({ success: false, message: error.message || "Server Error" });
  }
};

// Upload contract images to Cloudinary
exports.uploadContractImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No files uploaded" });
    }
    const imageUrls = req.files.map((file) => file.path);
    res.status(200).json({
      success: true,
      data: imageUrls,
    });
  } catch (error) {
    console.error("Upload Contract Images Error:", error);
    res.status(500).json({
      success: false,
      message: "Upload failed: " + (error.message || "Internal Server Error"),
    });
  }
};

// Update Contract (duration, coResidents, optional services, images)
exports.updateContract = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { id } = req.params;
    const { duration, coResidents, optionalServices, images } = req.body;

    // 1. Find and validate contract
    const contract = await Contract.findById(id)
      .populate({ path: "roomId", populate: { path: "roomTypeId" } })
      .session(session);
    if (!contract) throw new Error("Không tìm thấy hợp đồng.");
    if (contract.status !== "active")
      throw new Error("Chỉ có thể sửa hợp đồng đang hiệu lực.");

    // 2. Update duration & endDate if changed
    if (duration && duration !== contract.duration) {
      if (duration < 6) throw new Error("Thời hạn thuê tối thiểu 6 tháng.");
      const newEndDate = new Date(contract.startDate);
      newEndDate.setMonth(newEndDate.getMonth() + Number(duration));
      contract.duration = Number(duration);
      contract.endDate = newEndDate;
    }

    // 3. Update co-residents if provided
    if (coResidents !== undefined) {
      const personMax = contract.roomId?.roomTypeId?.personMax || 1;
      const totalPeople = (coResidents ? coResidents.length : 0) + 1;
      if (totalPeople > personMax) {
        throw new Error(
          `Số người ở (${totalPeople}) vượt quá giới hạn (tối đa ${personMax} người).`,
        );
      }
      contract.coResidents = coResidents;
    }

    // 4. Update images if provided
    if (images !== undefined) {
      if (!images || images.length === 0)
        throw new Error("Phải có ít nhất 1 ảnh hợp đồng.");
      contract.images = images;
    }

    await contract.save({ session });

    // 5. Update optional services in BookService record
    if (optionalServices !== undefined) {
      const bookServiceRecord = await BookService.findOne({
        contractId: contract._id,
      }).session(session);

      if (bookServiceRecord) {
        // Keep all fixed_monthly services, replace only quantity_based ones
        const Service = require("../../service-management/models/service.model");
        const allServices = await Service.find({ isActive: true }).session(
          session,
        );

        const getCategory = (name) => {
          const n = name.toLowerCase();
          if (n.includes("xe máy") || n.includes("xe đạp"))
            return "quantity_based";
          if (
            n.includes("thang máy") ||
            n.includes("elevator") ||
            n.includes("vệ sinh") ||
            n.includes("điện") ||
            n.includes("nước") ||
            n.includes("internet") ||
            n.includes("wifi")
          )
            return "fixed_monthly";
          return "quantity_based";
        };

        // Build a map of service id -> name for category lookup
        const serviceNameMap = {};
        allServices.forEach((s) => {
          serviceNameMap[s._id.toString()] = s.name;
        });

        // Keep fixed_monthly services from existing record
        const fixedServices = bookServiceRecord.services.filter((s) => {
          const name = serviceNameMap[s.serviceId.toString()] || "";
          return getCategory(name) === "fixed_monthly";
        });

        // Build new optional services entries
        const newOptional = optionalServices.map((s) => ({
          serviceId: s.serviceId,
          quantity: s.quantity || 1,
          startDate: s.startDate || contract.startDate,
          endDate: s.endDate || null,
        }));

        bookServiceRecord.services = [...fixedServices, ...newOptional];
        await bookServiceRecord.save({ session });
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: "Cập nhật hợp đồng thành công.",
      data: contract,
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Update Contract Error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

module.exports = exports;