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
  }
};

module.exports = {
  EMAIL_CONFIG,
  EMAIL_TEMPLATES
};
