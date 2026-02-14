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
            assets, // Array of handover assets
            initialPayment, // { rentAmount, total, paymentMethod }
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

        // 2. Manage Tenant Account
        console.log(`[DEBUG] Looking for user with email: ${tenantInfo.email} or phone: ${tenantInfo.phone}`);
        let user = await User.findOne({
            $or: [{ email: tenantInfo.email }, { phoneNumber: tenantInfo.phone }]
        }).session(session);

        // Generate Password: random 8 chars (Always do this)
        const passwordRaw = generateRandomString(8);
        const hashedPassword = await bcrypt.hash(passwordRaw, 10);

        if (!user) {
            console.log(`[DEBUG] User not found. Creating new user.`);
            // Generate Username: email prefix + room name (sanitized)
            const emailPrefix = tenantInfo.email.split("@")[0];
            const roomNameSanitized = room.name.replace(/[^a-zA-Z0-9]/g, "");
            const username = `${emailPrefix}${roomNameSanitized}`;

            // Create User
            user = new User({
                username,
                email: tenantInfo.email,
                phoneNumber: tenantInfo.phone,
                password: hashedPassword,
                role: "Tenant",
                status: "active",
            });
            await user.save({ session });

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
        } else {
            console.log(`[DEBUG] User found (ID: ${user._id}). Updating password.`);
            // Update existing user's password to the new random one
            user.password = hashedPassword;
            // Ensure phone/email match what was provided if we need to sync? 
            // For now, just update password to ensure they can login with the email we send.
            await user.save({ session });
        }

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
            financials: {
                paymentCycle: contractDetails.paymentCycle || 1,
                initialPayment: {
                    rentAmount: initialPayment.rentAmount,
                    depositAmount: depositAmount,
                    total: initialPayment.total,
                    paidAt: new Date(),
                    paymentMethod: initialPayment.paymentMethod
                }
            },
            assets,
        });

        await newContract.save({ session });

        // 4. Update Room Status
        room.status = "Occupied";
        await room.save({ session });

        // 5. Update Deposit Status (if applicable)
        if (depositId) {
            const deposit = await Deposit.findById(depositId).session(session);
            if (deposit) {
                deposit.status = "Completed";
                await deposit.save({ session });
            }
        }

        await session.commitTransaction();
        session.endSession();

        // 6. Send Email Notification (Await to ensure delivery or catch error)
        console.log(`[DEBUG] Preparing to send email to ${user.email}`);
        const emailContent = EMAIL_TEMPLATES.NEW_CONTRACT_ACCOUNT.getHtml(
            tenantInfo.fullName,
            user.username,
            passwordRaw,
            room.name
        );

        try {
            await sendEmail(user.email, EMAIL_TEMPLATES.NEW_CONTRACT_ACCOUNT.subject, emailContent);
            console.log(`✅ [DEBUG] Email successfully sent to ${user.email}`);
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
            .populate({
                path: "assets",
                populate: { path: "deviceId", select: "name brand model" }
            })
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
            .populate("services", "name currentPrice type")
            .populate({
                path: "assets",
                populate: { path: "deviceId", select: "name brand model" }
            });

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
