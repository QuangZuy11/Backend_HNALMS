const Deposit = require("../models/deposit.model");
const Room = require("../../room-floor-management/models/room.model");
const {
  sendEmail,
} = require("../../notification-management/services/email.service");

const getAllDeposits = async (req, res) => {
  try {
    const deposits = await Deposit.find()
      .populate({
        path: "room",
        select: "name type price maxPersons", // Select relevant room fields
      })
      .sort({ createdDate: -1 });

    res.status(200).json({
      success: true,
      message: "Fetched deposits successfully",
      data: deposits,
    });
  } catch (error) {
    console.error("Error in getAllDeposits:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching deposits",
      error: error.message,
    });
  }
};

const createDeposit = async (req, res) => {
  try {
    const { name, phone, email, room, amount } = req.body;

    // Validate required fields
    if (!name || !phone || !email || !room || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: name, phone, email, room, amount",
      });
    }

    // Check if room exists
    const roomExists = await Room.findById(room);
    if (!roomExists) {
      return res.status(404).json({
        success: false,
        message: "Room not found",
      });
    }

    // Check if room already has an active deposit
    const existingDeposit = await Deposit.findOne({
      room: room,
      status: "Held",
    });

    // Bổ sung: Nếu phòng đang 'Deposited' NHƯNG có hợp đồng tương lai > 30 ngày, 
    // thì VẪN CHO PHÉP người mới cọc (để họ vào lấp chỗ trống ngắn hạn).
    const Contract = require("../models/contract.model");
    let allowShortTermDeposit = false;
    let allowGuestDepositAfterTenantDecline = false;

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    // Người thuê đã từ chối gia hạn → phòng vẫn đang active nhưng có renewalDeclined
    // → Guest được phép đặt cọc ngay
    const tenantDeclinedContract = await Contract.findOne({
      roomId: room,
      status: "active",
      renewalDeclined: { $ne: false },
      endDate: { $gte: todayStart },
    })
      .select("_id contractCode")
      .lean();
    if (tenantDeclinedContract && existingDeposit) {
      allowGuestDepositAfterTenantDecline = true;
    }

    if (roomExists.status === "Deposited" && existingDeposit) {
      const futureContract = await Contract.findOne({
        roomId: room,
        status: "active",
        startDate: { $gt: new Date() }
      }).sort({ startDate: 1 });

      if (futureContract) {
         const daysUntilStart = Math.ceil((new Date(futureContract.startDate) - new Date()) / (1000 * 60 * 60 * 24));
         if (daysUntilStart >= 30) {
            // Chỉ cho phép nếu không có khoản cọc nào đang "lửng lơ" (chưa kí hợp đồng)
            const heldDeposits = await Deposit.find({ room: room, status: "Held" });
            const activeContracts = await Contract.find({ roomId: room, status: "active" });
            
            const boundDepositIds = activeContracts.map(c => c.depositId?.toString()).filter(Boolean);
            const floatingDeposits = heldDeposits.filter(d => !boundDepositIds.includes(d._id.toString()));

            if (floatingDeposits.length === 0) {
               allowShortTermDeposit = true;
            }
         }
      }
    }

    if (existingDeposit && !allowShortTermDeposit && !allowGuestDepositAfterTenantDecline) {
      return res.status(400).json({
        success: false,
        message: "This room already has an active deposit",
      });
    }

    // Create new deposit
    const newDeposit = new Deposit({
      name,
      phone,
      email,
      room,
      amount,
      status: "Held",
      createdDate: new Date(),
    });

    await newDeposit.save();

    // Update room status to Deposited
    await Room.findByIdAndUpdate(room, { status: "Deposited" });

    // Gửi email xác nhận deposit
    try {
      const subject = "Xác nhận đặt cọc phòng thành công - Hoàng Nam Building";
      const html = `
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Xác nhận đặt cọc phòng</title>
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 0; }
            .container { max-width: 520px; margin: 32px auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.07); overflow: hidden; }
            .header { background: linear-gradient(90deg, #1e3a8a 0%, #fbbf24 100%); color: #fff; padding: 28px 0 18px 0; text-align: center; }
            .header h1 { margin: 0; font-size: 2rem; letter-spacing: 1px; }
            .content { padding: 32px 28px 24px 28px; }
            .greeting { font-size: 1.15rem; color: #1e293b; margin-bottom: 18px; }
            .info-list { list-style: none; padding: 0; margin: 0 0 18px 0; }
            .info-list li { margin-bottom: 10px; font-size: 1rem; }
            .label { color: #475569; font-weight: 500; }
            .value { color: #1e293b; font-weight: 600; }
            .cta-btn { display: inline-block; margin-top: 18px; background: #1e3a8a; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-size: 1.08rem; font-weight: 500; letter-spacing: 0.5px; transition: background 0.2s; }
            .cta-btn:hover { background: #fbbf24; color: #1e293b; }
            .note { margin-top: 24px; color: #64748b; font-size: 0.98rem; text-align: center; }
            .footer { background: #fbbf24; color: #1e293b; text-align: center; font-size: 0.95rem; padding: 12px 0; border-radius: 0 0 12px 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Hoàng Nam Building</h1>
              <div style="font-size:1.08rem; margin-top:6px;">Xác nhận đặt cọc phòng</div>
            </div>
            <div class="content">
              <div class="greeting">Xin chào <strong>${name}</strong>,</div>
              <p>Bạn đã đặt cọc thành công phòng <span class="value">${roomExists.name || roomExists.roomCode || ""}</span> tại <span class="label">Hoàng Nam Building</span>.</p>
              <ul class="info-list">
                <li><span class="label">Số tiền cọc:</span> <span class="value">${amount.toLocaleString("vi-VN")}đ</span></li>
                <li><span class="label">Thời gian giữ phòng:</span> <span class="value">7 ngày</span></li>
                <li><span class="label">Ngày đặt cọc:</span> <span class="value">${new Date().toLocaleDateString("vi-VN")}</span></li>
              </ul>
              <a class="cta-btn" href="#" style="pointer-events:none;">Đến ký hợp đồng trong 7 ngày</a>
              <div class="note">Vui lòng đến ký hợp đồng trong thời gian giữ phòng để hoàn tất thủ tục thuê phòng.<br>Đây là email tự động, vui lòng không trả lời lại email này.</div>
            </div>
            <div class="footer">Cảm ơn bạn đã tin tưởng Hoàng Nam Building!</div>
          </div>
        </body>
        </html>
      `;
      await sendEmail(email, subject, html);
    } catch (mailErr) {
      console.error("Gửi email xác nhận cọc thất bại:", mailErr);
      // Không trả lỗi cho client, chỉ log
    }

    res.status(201).json({
      success: true,
      message: "Deposit created successfully",
      data: newDeposit,
    });
  } catch (error) {
    console.error("Error in createDeposit:", error);
    res.status(500).json({
      success: false,
      message: "Error creating deposit",
      error: error.message,
    });
  }
};

const getDepositById = async (req, res) => {
  try {
    const { id } = req.params;
    const deposit = await Deposit.findById(id).populate({
      path: "room",
      select: "name type price maxPersons",
    });

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Fetched deposit successfully",
      data: deposit,
    });
  } catch (error) {
    console.error("Error in getDepositById:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching deposit",
      error: error.message,
    });
  }
};

module.exports = {
  getAllDeposits,
  createDeposit,
  getDepositById,
};
