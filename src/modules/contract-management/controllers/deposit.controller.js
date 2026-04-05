const Deposit = require("../models/deposit.model");
const Contract = require("../models/contract.model");
const Room = require("../../room-floor-management/models/room.model");
const {
  sendEmail,
} = require("../../notification-management/services/email.service");

const getAllDeposits = async (req, res) => {
  try {
    const deposits = await Deposit.find()
      .populate({
        path: "room",
        select: "name type price maxPersons",
      })
      .populate({
        path: "contractId",
        select: "contractCode startDate endDate status tenantId",
      })
      .sort({ createdAt: -1 });

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

    // Lấy tất cả deposit đang Held của phòng này
    const existingHeldDeposits = await Deposit.find({
      room: room,
      status: "Held",
    });

    let allowDeposit = false;
    let allowShortTermDeposit = false;

    if (roomExists.status === "Available") {
      // Phòng trống hoàn toàn → cho phép đặt cọc
      allowDeposit = true;
    } else if (roomExists.status === "Deposited") {
      // Phòng đang deposited → kiểm tra các hợp đồng
      const futureContracts = await Contract.find({
        roomId: room,
        status: "active",
        isActivated: false,
        startDate: { $gt: new Date() },
      }).sort({ startDate: 1 });

      if (futureContracts.length > 0) {
        const nearestFuture = futureContracts[0];
        const daysUntilStart = Math.ceil(
          (new Date(nearestFuture.startDate) - new Date()) / (1000 * 60 * 60 * 24)
        );

        if (daysUntilStart < 30) {
          return res.status(400).json({
            success: false,
            message: `Không thể đặt cọc: Hợp đồng mới sẽ bắt đầu vào ngày ${new Date(nearestFuture.startDate).toLocaleDateString("vi-VN")} (còn ${daysUntilStart} ngày). Thời hạn tối thiểu để đặt cọc mới là 30 ngày.`,
          });
        }

        // >= 30 ngày → cho phép cọc ngắn hạn
        // Reset các deposit cũ chưa active về activationStatus = false
        for (const dep of existingHeldDeposits) {
          if (dep.activationStatus !== true) {
            dep.activationStatus = false;
            await dep.save();
          }
        }
        allowShortTermDeposit = true;
      } else {
        // Không có future contract đang chờ
        const activeContracts = await Contract.findOne({
          roomId: room,
          status: "active",
          isActivated: true,
        });
        if (activeContracts) {
          return res.status(400).json({
            success: false,
            message: "Phòng đang có người thuê, không thể đặt cọc.",
          });
        }
        // Trường hợp hy hữu: Deposited nhưng không có contract nào
        for (const dep of existingHeldDeposits) {
          dep.activationStatus = false;
          await dep.save();
        }
        allowDeposit = true;
      }
    }

    if (roomExists.status !== "Available" && !allowDeposit && !allowShortTermDeposit) {
      return res.status(400).json({
        success: false,
        message: `Phòng hiện không thể đặt cọc (trạng thái: ${roomExists.status})`,
      });
    }

    // Create new deposit - activationStatus = null (chờ contract kích hoạt)
    const newDeposit = new Deposit({
      name,
      phone,
      email,
      room,
      amount,
      status: "Held",
      activationStatus: null,
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
                <li><span class="label">Thời gian giữ phòng:</span> <span class="value">30 ngày</span></li>
                <li><span class="label">Ngày đặt cọc:</span> <span class="value">${new Date().toLocaleDateString("vi-VN")}</span></li>
              </ul>
              <a class="cta-btn" href="#" style="pointer-events:none;">Đến ký hợp đồng trong 30 ngày</a>
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
