const Contract = require("../models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const User = require("../../authentication/models/user.model");
const UserInfo = require("../../authentication/models/userInfor.model");
const Deposit = require("../models/deposit.model");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs"); // Ensure bcryptjs is installed

// Helper to generate random string
const generateRandomString = (length) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
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

const { sendEmail } = require("../../notification-management/services/email.service");
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
        } = req.body;

        // 1. Validate Room Status (populate roomTypeId to get price)
        const room = await Room.findById(roomId).populate("roomTypeId").session(session);
        if (!room) throw new Error("Room not found");
        if (room.status !== "Available" && room.status !== "Deposited") {
            if (room.status === "Occupied") throw new Error("Room is currently occupied.");
        }

        // Get room price and deposit from roomType
        const roomPrice = parseFloat(room.roomTypeId?.currentPrice?.toString() || "0");
        const depositAmount = roomPrice; // Deposit = 1 month rent

        // Validate personInRoom <= personMax from roomType
        const personMax = room.roomTypeId?.personMax || 1;
        const personInRoom = (coResidents ? coResidents.length : 0) + 1; // Tenant + Co-residents
        if (personInRoom > personMax) {
            throw new Error(`Số người ở (${personInRoom}) vượt quá giới hạn của loại phòng (tối đa ${personMax} người).`);
        }

        // 2. Always Create New Tenant Account
        const passwordRaw = generateRandomString(8);
        const hashedPassword = await bcrypt.hash(passwordRaw, 10);

        // Generate Username: email prefix + room name (sanitized)
        const emailPrefix = tenantInfo.email.split("@")[0];
        const roomNameSanitized = room.name.replace(/[^a-zA-Z0-9]/g, "");
        let finalUsername = `${emailPrefix}${roomNameSanitized}`;

        // Ensure username is unique
        const existingUser = await User.findOne({ username: finalUsername }).session(session);
        if (existingUser) {
            finalUsername = `${finalUsername}${Math.floor(100 + Math.random() * 900)}`;
        }

        console.log(`[CREATE USER] Creating new Tenant: email=${tenantInfo.email}, phone=${tenantInfo.phone}, username=${finalUsername}`);

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

        // 3. Create Contract Record
        const endDate = new Date(contractDetails.startDate);
        endDate.setMonth(endDate.getMonth() + contractDetails.duration);

        // Extract service IDs from the request (array of {serviceId, name, price, type})
        const serviceIds = (contractDetails.services || []).map(s => s.serviceId || s);

        const newContract = new Contract({
            contractCode: generateContractCode(room.name),
            roomId: room._id,
            tenantId: user._id,
            depositId: depositId || null,
            personInRoom,
            coResidents,
            startDate: contractDetails.startDate,
            endDate: endDate,
            duration: contractDetails.duration,
            status: "active",
            services: serviceIds,
            images: req.body.images || [],
        });

        await newContract.save({ session });

        // 4. Update Room Status
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
            room.name
        );

        try {
            await sendEmail(recipientEmail, EMAIL_TEMPLATES.NEW_CONTRACT_ACCOUNT.subject, emailContent);
            console.log(`✅ [DEBUG] Email successfully sent to ${recipientEmail}`);
        } catch (emailError) {
            console.error(`❌ [DEBUG] Failed to send email to ${user.email}:`, emailError);
            // We don't throw here to ensure the contract creation success is still returned, 
            // but we might want to warn the user in the response if critical.
        }

        res.status(201).json({
            success: true,
            message: "Contract created successfully. Account credentials sent to email.",
            data: {
                contract: newContract,
                account: {
                    username: user.username,
                    password: passwordRaw
                }
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
                populate: { path: "roomTypeId", select: "typeName currentPrice" }
            })
            .populate("tenantId", "username email phoneNumber")
            .populate("services", "name currentPrice type")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: contracts.length,
            data: contracts
        });
    } catch (error) {
        console.error("Get All Contracts Error:", error);
        res.status(500).json({
            success: false,
            message: "Server Error"
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
                    { path: "floorId", select: "name" }
                ]
            })
            .populate("tenantId", "username email phoneNumber")
            .populate("services", "name currentPrice type");

        if (!contract) {
            return res.status(404).json({ success: false, message: "Contract not found" });
        }

        // Fetch tenant's UserInfo separately
        const tenantInfo = await UserInfo.findOne({ userId: contract.tenantId._id });

        // Convert to plain object and fix Decimal128 fields
        const contractData = contract.toObject();

        // Fix roomType currentPrice (Decimal128 → Number)
        if (contractData.roomId?.roomTypeId?.currentPrice) {
            contractData.roomId.roomTypeId.currentPrice = parseFloat(contractData.roomId.roomTypeId.currentPrice.toString());
        }
        // Fix service currentPrice (Decimal128 → Number)
        if (contractData.services) {
            contractData.services = contractData.services.map(s => ({
                ...s,
                currentPrice: s.currentPrice ? parseFloat(s.currentPrice.toString()) : 0
            }));
        }

        res.status(200).json({
            success: true,
            data: {
                ...contractData,
                tenantInfo: tenantInfo ? tenantInfo.toObject() : null
            }
        });
    } catch (error) {
        console.error("Get Contract By ID Error:", error);
        res.status(500).json({
            success: false,
            message: "Server Error"
        });
    }
};

// Upload contract images to Cloudinary
exports.uploadContractImages = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: "No files uploaded" });
        }
        const imageUrls = req.files.map(file => file.path);
        res.status(200).json({
            success: true,
            data: imageUrls
        });
    } catch (error) {
        console.error("Upload Contract Images Error:", error);
        res.status(500).json({
            success: false,
            message: "Upload failed: " + (error.message || "Internal Server Error")
        });
    }
};
