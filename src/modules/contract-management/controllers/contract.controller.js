const Contract = require("../models/contract.model");
const BookService = require("../models/bookservice.model");
const Room = require("../../room-floor-management/models/room.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const Deposit = require("../models/deposit.model");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Ensure bcryptjs is installed

// Helper to generate random string
const generateRandomString = (length) => {
    const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
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
            contractDetails, // { startDate, duration, services, paymentCycle }
            bookServices, // NEW: array of { serviceId, name, price, type, category, quantity }
        } = req.body;

        // 1. Validate Room Status (populate roomTypeId to get price)
        const room = await Room.findById(roomId).populate("roomTypeId").session(session);
        if (!room) throw new Error("Room not found");
        if (room.status !== "Available" && room.status !== "Deposited") {
            if (room.status === "Occupied") throw new Error("Room is currently occupied.");
        }

        // 1.5. Validate startDate: chỉ được tối đa 7 ngày từ khi bắt đầu cọc (nếu có deposit)
        if (depositId) {
            const deposit = await Deposit.findById(depositId).session(session);
            if (deposit) {
                const depositCreatedDate = new Date(deposit.createdAt);
                const maxStartDate = new Date(depositCreatedDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                const contractStartDate = new Date(contractDetails.startDate);

                if (contractStartDate > maxStartDate) {
                    throw new Error(
                        `Ngày bắt đầu thuê không được quá 7 ngày từ khi đặt cọc. ` +
                        `Ngày cọc: ${depositCreatedDate.toLocaleDateString('vi-VN')}, ` +
                        `Hạn cuối: ${maxStartDate.toLocaleDateString('vi-VN')}, ` +
                        `Ngày bắt đầu: ${contractStartDate.toLocaleDateString('vi-VN')}`
                    );
                }
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

        // 2. Always Create New Tenant Account
        const passwordRaw = generateRandomString(8);
        const hashedPassword = await bcrypt.hash(passwordRaw, 10);

        // Generate Username: email prefix + room name (sanitized)
        const emailPrefix = tenantInfo.email.split("@")[0];
        const roomNameSanitized = room.name.replace(/[^a-zA-Z0-9]/g, "");
        let finalUsername = `${emailPrefix}${roomNameSanitized}`;

        // Ensure username is unique
        const existingUser = await User.findOne({
            username: finalUsername,
        }).session(session);
        if (existingUser) {
            finalUsername = `${finalUsername}${Math.floor(100 + Math.random() * 900)}`;
        }

        console.log(
            `[CREATE USER] Creating new Tenant: email=${tenantInfo.email}, phone=${tenantInfo.phone}, username=${finalUsername}`,
        );

        const user = new User({
            username: finalUsername,
            email: tenantInfo.email,
            phoneNumber: tenantInfo.phone,
            password: hashedPassword,
            role: "Tenant",
            status: "active",
        });
        await user.save({ session });
        console.log(`[CREATE USER] ✅ New Tenant created with ID: ${user._id}`);

        // Create UserInfo
        const userInfo = new UserInfo({
            userId: user._id,
            fullname: tenantInfo.fullName,
            cccd: tenantInfo.cccd,
            address: tenantInfo.address,
            dob: tenantInfo.dob,
            gender: tenantInfo.gender || "Other",
        });
        await userInfo.save({ session });

    // 3. Find the Deposit linked to this room (status = "Held")
    let linkedDepositId = depositId || null;
    if (!linkedDepositId && room.status === "Deposited") {
      const deposit = await Deposit.findOne({
        room: room._id,
        status: "Held",
      }).session(session);
      if (deposit) {
        linkedDepositId = deposit._id;
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
      duration: contractDetails.duration,
      status: "active",
      images: req.body.images || [],
    });

        await newContract.save({ session });

    // 4. Create BookService record (1 document per contract, array of services)
    if (bookServices && bookServices.length > 0) {
      const contractStartDate = new Date(contractDetails.startDate);
      const bookServiceRecord = new BookService({
        contractId: newContract._id,
        services: bookServices.map((s) => ({
          serviceId: s.serviceId,
          quantity:
            s.category === "quantity_based" && s.quantity ? s.quantity : 1,
          startDate: contractStartDate,
          endDate: null,
        })),
      });
      await bookServiceRecord.save({ session });
    }

        // 5. Update Room Status
        room.status = "Occupied";
        await room.save({ session });

        // 5. Deposit remains "Held" status when linked to a contract (no status change needed)

        await session.commitTransaction();
        session.endSession();

        // 6. Send Email Notification to the tenant's email from the form (NOT user.email from DB)
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

        res.status(201).json({
            success: true,
            message:
                "Contract created successfully. Account credentials sent to email.",
            data: {
                contract: newContract,
                account: {
                    username: user.username,
                    password: passwordRaw,
                },
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
            .populate("tenantId", "username email phoneNumber");

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
      .populate("depositId", "name phone email room amount status createdDate")
      .populate("services", "name currentPrice type")
      .sort({ createdAt: -1 })
      .lean();

    // Fix Decimal128 fields
    const data = contracts.map((c) => {
      if (c.roomId?.roomTypeId?.currentPrice) {
        c.roomId.roomTypeId.currentPrice = parseFloat(
          c.roomId.roomTypeId.currentPrice.toString(),
        );
      }
      if (c.services) {
        c.services = c.services.map((s) => ({
          ...s,
          currentPrice: s.currentPrice
            ? parseFloat(s.currentPrice.toString())
            : 0,
        }));
      }
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
