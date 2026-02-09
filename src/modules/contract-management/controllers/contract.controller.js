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
            // Allow creating contract even if "Deposited", but check if it matches the depositId if provided
            // For simplicity, we just check if it's not Occupied/Maintenance (unless logic dictates otherwise)
            // Note: User requirement says "Trống" or "Đã cọc".
            if (room.status === "Occupied") throw new Error("Room is currently occupied.");
        }

        // 2. Manage Tenant Account
        let user = await User.findOne({
            $or: [{ email: tenantInfo.email }, { phoneNumber: tenantInfo.phone }]
        }).session(session);

        let passwordRaw = "";

        if (!user) {
            // Generate Username: email prefix + room name (sanitized)
            const emailPrefix = tenantInfo.email.split("@")[0];
            const roomNameSanitized = room.name.replace(/[^a-zA-Z0-9]/g, "");
            const username = `${emailPrefix}${roomNameSanitized}`;

            // Generate Password: random 8 chars
            passwordRaw = generateRandomString(8);
            const hashedPassword = await bcrypt.hash(passwordRaw, 10);

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
            // If user exists, ensure they have the Tenant role (or add logic to support multi-role?)
            // For now, assume existing user is okay.
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
        // "Trạng thái phòng chuyển thành 'Đang thuê' kể từ ngày bắt đầu"
        // For MVP, we update immediately if start date is close or today.
        room.status = "Occupied";
        // We might want to link currentContractId to room if the model supports it, but checking Room model it doesn't have it explicitly yet.
        // If needed: room.currentContract = newContract._id; 
        await room.save({ session });

        // 5. Update Deposit Status (if applicable)
        if (depositId) {
            const deposit = await Deposit.findById(depositId).session(session);
            if (deposit) {
                deposit.status = "Completed"; // Or whatever status indicates it's converted to contract
                await deposit.save({ session });
            }
        }

        await session.commitTransaction();
        session.endSession();

        // 6. Send Email (Mocked)
        // TODO: Implement Nodemailer to send username/password to user.email
        console.log(`[Email Mock] Sent credentials to ${user.email}: User=${user.username}, Pass=${passwordRaw}`);

        res.status(201).json({
            success: true,
            message: "Contract created successfully",
            data: {
                contract: newContract,
                account: {
                    username: user.username,
                    password: passwordRaw // Only show this once!
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
