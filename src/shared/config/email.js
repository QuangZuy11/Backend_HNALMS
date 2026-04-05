require("dotenv").config();

// Email Configuration
const EMAIL_CONFIG = {
  host: process.env.EMAIL_HOST || "smtp.gmail.com",
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
}; // dung de gui mail

// Email templates
const EMAIL_TEMPLATES = {
  FORGOT_PASSWORD: {
    subject: "Đặt lại mật khẩu - HNALMS",
    getHtml: (fullname, newPassword) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #FCD34D; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .password-box { background: white; padding: 15px; border-left: 4px solid #FCD34D; margin: 20px 0; }
          .password { font-size: 24px; font-weight: bold; color: #1F2937; letter-spacing: 2px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
          .warning { color: #DC2626; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0; color: #1F2937;">HNALMS</h1>
            <p style="margin: 5px 0 0 0; color: #6B7280;">Hệ thống quản lý căn hộ</p>
          </div>
          <div class="content">
            <h2>Xin chào ${fullname},</h2>
            <p>Chúng tôi đã nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.</p>
            <p>Mật khẩu mới của bạn là:</p>
            <div class="password-box">
              <div class="password">${newPassword}</div>
            </div>
            <p class="warning">
              <strong>⚠️ Lưu ý quan trọng:</strong><br>
              - Vui lòng đổi mật khẩu ngay sau khi đăng nhập<br>
              - Không chia sẻ mật khẩu này với bất kỳ ai<br>
              - Email này chỉ có hiệu lực trong 24 giờ
            </p>
            <p>Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng liên hệ với chúng tôi ngay lập tức.</p>
            <p>Trân trọng,<br><strong>Đội ngũ HNALMS</strong></p>
          </div>
          <div class="footer">
            <p>Email này được gửi tự động, vui lòng không trả lời.</p>
            <p>&copy; 2024 HNALMS. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  },
  NEW_CONTRACT_ACCOUNT: {
    subject: "Thông tin tài khoản - Hợp đồng thuê nhà mới",
    getHtml: (fullname, username, password, roomName) => `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #10B981; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; color: white; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials-box { background: white; padding: 20px; border-left: 4px solid #10B981; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .credential-item { margin-bottom: 10px; }
          .label { font-weight: bold; color: #555; display: inline-block; width: 100px; }
          .value { font-family: 'Courier New', monospace; font-weight: bold; font-size: 16px; color: #1F2937; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin: 0;">Chào mừng đến với HNALMS</h1>
            <p style="margin: 5px 0 0 0;">Thông tin tài khoản cư dân</p>
          </div>
          <div class="content">
            <h2>Xin chào ${fullname},</h2>
            <p>Hợp đồng thuê phòng <strong>${roomName}</strong> của bạn đã được tạo thành công.</p>
            <p>Dưới đây là thông tin tài khoản để bạn đăng nhập vào hệ thống và quản lý dịch vụ:</p>
            
            <div class="credentials-box">
              <div class="credential-item">
                <span class="label">Tài khoản:</span>
                <span class="value">${username}</span>
              </div>
              <div class="credential-item">
                <span class="label">Mật khẩu:</span>
                <span class="value">${password}</span>
              </div>
            </div>

            <p><strong>⚠️ Lưu ý:</strong> Vui lòng đăng nhập và đổi mật khẩu ngay để đảm bảo an toàn.</p>
            
            <p>Trân trọng,<br><strong>Ban Quản Lý Tòa Nhà</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} HNALMS. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `
  }
};

// Template xác nhận đặt cọc phòng thành công
EMAIL_TEMPLATES.DEPOSIT_CONFIRMATION = {
  subject: "Xác nhận đặt cọc phòng thành công - HNALMS",
  getHtml: (guestName, roomName, amount, transactionCode) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #FCD34D; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .info-box { background: white; padding: 15px; border-left: 4px solid #16A34A; margin: 20px 0; border-radius: 4px; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .info-row:last-child { border-bottom: none; }
        .label { color: #6B7280; font-size: 14px; }
        .value { font-weight: bold; color: #1F2937; }
        .badge { background: #D1FAE5; color: #065F46; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: bold; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        .notice { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 15px; border-radius: 4px; margin-top: 15px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0; color: #1F2937;">HNALMS</h1>
          <p style="margin: 5px 0 0 0; color: #6B7280;">Hệ thống quản lý căn hộ</p>
        </div>
        <div class="content">
          <h2>Xin chào ${guestName},</h2>
          <p>Chúng tôi xác nhận rằng <strong>đặt cọc phòng của bạn đã được ghi nhận thành công</strong>.</p>
          <div class="info-box">
            <div class="info-row"><span class="label">Phòng</span><span class="value">${roomName}</span></div>
            <div class="info-row"><span class="label">Số tiền đặt cọc</span><span class="value">${new Intl.NumberFormat('vi-VN').format(amount)} đ</span></div>
            <div class="info-row"><span class="label">Mã giao dịch</span><span class="value">${transactionCode}</span></div>
            <div class="info-row"><span class="label">Trạng thái</span><span class="badge">✅ Đã xác nhận</span></div>
          </div>
          <div class="notice">
            <strong>⏰ Lưu ý quan trọng:</strong><br/>
            Phòng sẽ được giữ trong <strong>30 ngày</strong> kể từ hôm nay.<br/>
            Vui lòng liên hệ ban quản lý để ký hợp đồng trước khi hết thời hạn.
          </div>
          <p style="margin-top: 20px;">Trân trọng,<br><strong>Ban Quản Lý Tòa Nhà</strong></p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} HNALMS. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `
};

module.exports = {
  EMAIL_CONFIG,
  EMAIL_TEMPLATES
};
