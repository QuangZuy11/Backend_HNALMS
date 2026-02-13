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
            contractDetails, // { startDate, duration, roomPrice, depositAmount, services, ... }
            initialReadings, // { electricity, water }
            assets, // Array of handover assets
            initialPayment, // { rentAmount, total, paymentMethod }
        } = req.body;

        // 1. Validate Room Status
        const room = await Room.findById(roomId).session(session);
        if (!room) throw new Error("Room not found");
        if (room.status !== "Available" && room.status !== "Deposited") {
            if (room.status === "Occupied") throw new Error("Room is currently occupied.");
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

        const newContract = new Contract({
            contractCode: generateContractCode(room.name),
            roomId: room._id,
            tenantId: user._id,
            depositId: depositId || null,
            personInRoom: (coResidents ? coResidents.length : 0) + 1, // Tenant + Co-residents
            coResidents,
            startDate: contractDetails.startDate,
            endDate: endDate,
            duration: contractDetails.duration,
            status: "active",
            financials: {
                roomPrice: contractDetails.roomPrice,
                depositAmount: contractDetails.depositAmount,
                paymentCycle: contractDetails.paymentCycle || 1,
                services: contractDetails.services,
                initialPayment: {
                    rentAmount: initialPayment.rentAmount,
                    depositAmount: contractDetails.depositAmount,
                    total: initialPayment.total,
                    paidAt: new Date(),
                    paymentMethod: initialPayment.paymentMethod
                }
            },
            assets,
            initialReadings,
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
            .populate("roomId", "name customId price status")
            .populate("tenantId", "username email phoneNumber")
            .populate("financials.services.serviceId", "name type price")
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
