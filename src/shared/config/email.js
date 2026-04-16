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


// Template thông báo thanh lý hợp đồng / hóa đơn tất toán
EMAIL_TEMPLATES.LIQUIDATION_SETTLEMENT = {
  subject: "Thông báo thanh lý hợp đồng & Hóa đơn tất toán - HNALMS",
  getHtml: (tenantName, roomName, liquidationType, liquidationDate, totalSettlement, type) => {
    const isForceMajeure = type === "force_majeure";
    const accentColor = isForceMajeure ? "#3B82F6" : "#EF4444";
    const totalFormatted = new Intl.NumberFormat("vi-VN").format(Math.abs(totalSettlement));
    const isRefund = isForceMajeure;
    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: ${accentColor}; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; color: white; }
        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
        .info-box { background: white; padding: 15px; border-left: 4px solid ${accentColor}; margin: 20px 0; border-radius: 4px; }
        .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .info-row:last-child { border-bottom: none; }
        .label { color: #6B7280; font-size: 14px; }
        .value { font-weight: bold; color: #1F2937; }
        .total { font-size: 18px; color: ${accentColor}; }
        .footer { text-align: center; margin-top: 20px; color: #666; font-size: 12px; }
        .notice { background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 12px 15px; border-radius: 4px; margin-top: 15px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1 style="margin: 0;">HNALMS</h1>
          <p style="margin: 5px 0 0 0;">Thông báo thanh lý hợp đồng</p>
        </div>
        <div class="content">
          <h2>Xin chào ${tenantName},</h2>
          <p>Hợp đồng thuê phòng <strong>${roomName}</strong> của bạn đã được chính thức thanh lý theo lý do: <strong>${liquidationType}</strong>.</p>
          <div class="info-box">
            <div class="info-row"><span class="label">Phòng</span><span class="value">${roomName}</span></div>
            <div class="info-row"><span class="label">Loại thanh lý</span><span class="value">${liquidationType}</span></div>
            <div class="info-row"><span class="label">Ngày thanh lý</span><span class="value">${liquidationDate}</span></div>
            <div class="info-row">
              <span class="label">${isRefund ? "Số tiền được hoàn lại" : "Số tiền cần thanh toán thêm"}</span>
              <span class="value total">${totalFormatted} đ</span>
            </div>
          </div>
          <div class="notice">
            <strong>⚠️ Lưu ý:</strong><br/>
            ${isRefund
        ? "Số tiền hoàn lại sẽ được Ban quản lý liên hệ và chuyển khoản trong vòng <strong>3 ngày làm việc</strong>."
        : "Vui lòng thanh toán số tiền còn nợ trong vòng <strong>3 ngày</strong> kể từ ngày thanh lý."
      }
          </div>
          <p style="margin-top: 20px;">Trân trọng,<br><strong>Ban Quản Lý Tòa Nhà</strong></p>
        </div>
        <div class="footer">
          <p>&copy; ${new Date().getFullYear()} HNALMS. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  }
};

// Template xác nhận hợp đồng (giống form hợp đồng pdf)
EMAIL_TEMPLATES.ONLINE_BOOKING_CONTRACT = {
  subject: "Xác nhận & Hợp đồng thuê nhà điện tử - HNALMS",
  getHtml: (tenantName, tenantIdCard, roomName, duration, priceStr, startDateStr, endDateStr, prepayMonths, depositAmount) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: 'Times New Roman', serif; line-height: 1.6; color: #000; }
        .container { max-width: 700px; margin: 0 auto; padding: 30px; background: #fff; }
        .header { text-align: center; margin-bottom: 30px; }
        .title { font-size: 20px; font-weight: bold; margin-bottom: 20px; text-transform: uppercase; }
        .section { margin-top: 15px; margin-bottom: 15px; }
        .bold { font-weight: bold; }
        .italic { font-style: italic; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2 style="margin:0;">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</h2>
          <h3 style="margin:0; text-decoration: underline;">Độc lập - Tự do - Hạnh phúc</h3>
        </div>
        
        <div align="center" class="title">HỢP ĐỒNG THUÊ NHÀ</div>
        
        <div class="section">
          <p>Hôm nay, hai bên chúng tôi gồm:</p>
          <div class="bold">BÊN CHO THUÊ (BÊN A): BAN QUẢN LÝ TÒA NHÀ HNALMS</div>
          <p>Đại diện: Ban Quản Lý (Là đơn vị quản lý, vận hành phòng thuê)</p>
          
          <div class="bold" style="margin-top:10px;">BÊN THUÊ (BÊN B):</div>
          <p>Ông/Bà: <span class="bold">${tenantName}</span></p>
          <p>CCCD/CMND: <span class="bold">${tenantIdCard || "......................."}</span></p>
        </div>

        <div class="section">
          <div class="bold">Điều 1: Nội dung hợp đồng</div>
          <p>Bên A đồng ý cho bên B thuê phòng <span class="bold">${roomName}</span> thuộc hệ thống quản lý của HNALMS.</p>
          <p>- Thời hạn thuê: <span class="bold">${duration}</span> tháng, từ ngày <span class="bold">${startDateStr}</span> đến ngày <span class="bold">${endDateStr}</span>.</p>
        </div>

        <div class="section">
          <div class="bold">Điều 2: Giá thuê, tiền cọc và phương thức thanh toán</div>
          <p>- Giá thuê phòng: <span class="bold">${priceStr}</span> VNĐ / tháng.</p>
          <p>- Tiền cọc đã nhận: <span class="bold">${new Intl.NumberFormat('vi-VN').format(depositAmount)}</span> VNĐ.</p>
          <p>- Hình thức thanh toán: Thanh toán <span class="bold">${prepayMonths}</span> tháng / lần vào đầu mỗi chu kỳ.</p>
        </div>
        
        <div class="section">
          <div class="bold">Điều 3: Cam kết chung</div>
          <p>Bên B cam kết tuân thủ đầy đủ các nội quy tòa nhà, thanh toán tiền thuê và dịch vụ đúng hạn. Bên A cam kết bàn giao phòng và cung cấp các dịch vụ quản lý như thỏa thuận.</p>
          <p class="italic" style="margin-top: 10px; color: #555;">(Hợp đồng này được tạo và lưu trữ điện tử từ hệ thống Booking HNALMS với giá trị pháp lý là thỏa thuận giữ phòng và xác nhận thuê phòng. Hợp đồng chính thức bản cứng sẽ được gửi/ký bổ sung theo quy định của Ban quản lý nếu cần).</p>
        </div>
        <br/>
        <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 30px;">
          <div style="width: 45%; float: left; text-align: center;">
            <div class="bold">ĐẠI DIỆN BÊN A</div>
            <p class="italic">(Đã ký số)</p>
            <div class="bold" style="margin-top: 40px;">BQL HNALMS</div>
          </div>
          <div style="width: 45%; float: right; text-align: center;">
            <div class="bold">ĐẠI DIỆN BÊN B</div>
            <p class="italic">(Xác nhận điện tử)</p>
            <div class="bold" style="margin-top: 40px;">${tenantName}</div>
          </div>
          <div style="clear:both;"></div>
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
