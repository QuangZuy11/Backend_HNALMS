const BookingRequest = require("../models/booking-request.model");
const Room = require("../../room-floor-management/models/room.model");
const { sendEmail } = require("../../notification-management/services/email.service");
const Service = require("../../service-management/models/service.model");
const RoomDevice = require("../../room-floor-management/models/roomdevices.model");
const Payment = require("../../invoice-management/models/payment.model");


exports.createBookingRequest = async (req, res) => {
  try {
    const {
      roomId,
      name,
      phone,
      email,
      idCard,
      dob,
      address,
      startDate,
      duration,
      prepayMonths,
      coResidents,
    } = req.body;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: "Không tìm thấy phòng." });
    }

    const bookingRequest = new BookingRequest({
      roomId,
      name,
      phone,
      email,
      idCard,
      dob: new Date(dob),
      address,
      startDate: new Date(startDate),
      duration: parseInt(duration, 10) || 12,
      prepayMonths: prepayMonths === "all" ? "all" : (parseInt(prepayMonths, 10) || 2),
      coResidents: Array.isArray(coResidents) ? coResidents : [],
      status: "Pending",
    });

    await bookingRequest.save();

    res.status(201).json({
      success: true,
      message: "Yêu cầu đặt phòng đã được gửi thành công.",
      data: bookingRequest,
    });
  } catch (error) {
    console.error("Error creating booking request:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

exports.getAllBookingRequests = async (req, res) => {
  try {
    const { status } = req.query;
    let filter = {};
    if (status) filter.status = status;

    const requests = await BookingRequest.find(filter)
      .populate("roomId", "name customId roomCode floorId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests,
    });
  } catch (error) {
    console.error("Error fetching booking requests:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

exports.getBookingRequestById = async (req, res) => {
  try {
    const request = await BookingRequest.findById(req.params.id)
      .populate({
        path: "roomId",
        select: "name roomCode floorId roomTypeId",
        populate: [
          { path: "roomTypeId", select: "typeName currentPrice personMax" }
        ]
      });

    if (!request) {
      return res.status(404).json({ success: false, message: "Không tìm thấy yêu cầu này." });
    }

    res.status(200).json({
      success: true,
      data: request,
    });
  } catch (error) {
    console.error("Error fetching booking request by id:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

exports.updateBookingRequestStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["Pending", "Processed", "Rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ." });
    }

    const request = await BookingRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!request) {
      return res.status(404).json({ success: false, message: "Không tìm thấy yêu cầu." });
    }

    res.status(200).json({
      success: true,
      message: "Cập nhật thành công.",
      data: request,
    });
  } catch (error) {
    console.error("Error updating booking request status:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

exports.sendPaymentInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const request = await BookingRequest.findById(id).populate({
      path: "roomId",
      populate: { path: "roomTypeId" }
    });

    if (!request) {
      return res.status(404).json({ success: false, message: "Không tìm thấy yêu cầu này." });
    }

    // Update info from the finalize form
    if (updateData.tenantInfo) {
      request.name = updateData.tenantInfo.fullName || request.name;
      request.phone = updateData.tenantInfo.phone || request.phone;
      request.email = updateData.tenantInfo.email || request.email;
      request.idCard = updateData.tenantInfo.cccd || request.idCard;
      if (updateData.tenantInfo.dob) request.dob = new Date(updateData.tenantInfo.dob);
      request.address = updateData.tenantInfo.address || request.address;
      request.gender = updateData.tenantInfo.gender || "Male";
      request.contactRef = updateData.tenantInfo.contactRef;
    }
    
    if (updateData.startDate) request.startDate = new Date(updateData.startDate);
    if (updateData.duration) request.duration = parseInt(updateData.duration, 10);
    if (updateData.prepayMonths) request.prepayMonths = updateData.prepayMonths;
    if (updateData.coResidents) request.coResidents = updateData.coResidents;
    if (updateData.bookServices) request.servicesInfo = updateData.bookServices;
    
    const roomPrice = parseFloat(request.roomId.roomTypeId?.currentPrice || 0);
    
    // Deposit amount default to 1 month rent (or you can adjust logic)
    const depositAmount = roomPrice;
    request.depositAmount = depositAmount;

    // Prepay amount
    const prepayMonthsNum = updateData.prepayMonths === "all" ? request.duration : parseInt(updateData.prepayMonths, 10);
    const prepayAmount = roomPrice * prepayMonthsNum;
    request.prepayAmount = prepayAmount;

    const totalAmount = depositAmount + prepayAmount;
    request.totalAmount = totalAmount;

    // Generate VietQR / Sepay QR URL using COC format (same as normal deposits)
    const bankBin = process.env.BANK_BIN || "970422"; 
    const bankAccount = process.env.BANK_ACCOUNT || "0372051662";
    const bankAccountName = encodeURIComponent(process.env.BANK_ACCOUNT_NAME || "HOANG NAM ALMS");

    // Generate transaction code: "Coc <RoomCode> <8 random digits>"
    // Ví dụ: Coc P112A 89358552
    const roomCodeRaw = request.roomId.roomCode || request.roomId.name || "PHONG";
    const roomCodeShort = roomCodeRaw.replace(/Ph\u00f2ng\s*/gi, 'P').replace(/[^a-zA-Z0-9]/g, '');
    const random8 = String(Math.floor(10000000 + Math.random() * 90000000));
    const transactionCode = `Coc ${roomCodeShort} ${random8}`;
    const encodedCode = encodeURIComponent(transactionCode);

    // Generate Sepay QR link format
    const qrUrl = `https://qr.sepay.vn/img?acc=${bankAccount}&bank=${bankBin}&amount=${totalAmount}&des=${encodedCode}`;
    
    // Set expiry to 12 hours from now
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 12);

    // Create a Pending Payment record
    const Payment = require("../../invoice-management/models/payment.model");
    const paymentRecord = new Payment({
      bookingRequestId: request._id,
      amount: totalAmount,
      transactionCode: transactionCode,
      status: "Pending",
    });
    await paymentRecord.save();

    request.transactionCode = transactionCode;
    request.paymentQR = qrUrl;
    request.paymentStatusId = paymentRecord._id;
    request.status = "Awaiting Payment";
    request.paymentExpiresAt = expiresAt;
    
    await request.save();

    // Lock the room so nobody else can take it
    await Room.findByIdAndUpdate(request.roomId._id, { status: "Deposited" });

    // Send email to guest with the QR code
    const emailSubject = "Yêu cầu thanh toán giữ phòng và Hợp đồng - Hoàng Nam";
    
    // Fetch Services and Assets
    const servicesList = await Service.find({ isActive: true });
    
    let roomAssets = [];
    if (request.roomId && request.roomId.roomTypeId) {
      roomAssets = await RoomDevice.find({
        roomTypeId: request.roomId.roomTypeId._id,
      }).populate({ path: "deviceId", select: "name brand unit" });
    }

    const today = new Date();
    const dStr = String(today.getDate()).padStart(2, "0");
    const mStr = String(today.getMonth() + 1).padStart(2, "0");
    const yStr = today.getFullYear();
    
    const dobObj = request.dob ? new Date(request.dob) : null;
    const dobStr = dobObj ? `${String(dobObj.getDate()).padStart(2, "0")}/${String(dobObj.getMonth() + 1).padStart(2, "0")}/${dobObj.getFullYear()}` : "";
    
    const startObj = request.startDate ? new Date(request.startDate) : null;
    const startStr = startObj ? `${String(startObj.getDate()).padStart(2, "0")}/${String(startObj.getMonth() + 1).padStart(2, "0")}/${startObj.getFullYear()}` : "";
    
    let endStr = "";
    if (startObj && request.duration) {
      let endObj = new Date(startObj);
      endObj.setMonth(endObj.getMonth() + request.duration);
      endObj.setDate(endObj.getDate() - 1);
      endStr = `${String(endObj.getDate()).padStart(2,"0")}/${String(endObj.getMonth()+1).padStart(2,"0")}/${endObj.getFullYear()}`;
    }

    // Prepare CoResidents HTML
    const maxPersons = request.roomId.roomTypeId?.personMax || 1;
    let coResHtml = "";
    if (request.coResidents && request.coResidents.length > 0) {
      coResHtml += `<table border="1" style="border-collapse: collapse; width: 100%; margin-top: 10px;">
        <tr><th>STT</th><th>Họ và tên</th><th>Số CCCD/CMND</th></tr>`;
      request.coResidents.forEach((cr, idx) => {
        coResHtml += `<tr><td style="text-align:center">${idx+1}</td><td>${cr.fullName}</td><td>${cr.cccd}</td></tr>`;
      });
      coResHtml += `</table>`;
      if (request.coResidents.length + 1 >= maxPersons) {
        coResHtml += `<p style="font-style: italic; color: #888;">(Đã đạt giới hạn số người cho loại phòng này)</p>`;
      }
    } else {
      coResHtml += `<p style="font-style: italic;">Chưa có người ở cùng.</p>`;
    }

    // Equipment HTML
    let assetsHtml = `<table border="1" style="border-collapse: collapse; width: 100%; margin-top: 10px;">
      <tr><th>STT</th><th>Tên thiết bị</th><th>Số lượng</th><th>Đơn vị</th></tr>`;
    if (roomAssets.length > 0) {
      roomAssets.forEach((asset, idx) => {
        const dName = asset.deviceId ? `${asset.deviceId.name} ${asset.deviceId.brand ? "("+asset.deviceId.brand+")" : ""}` : "Thiết bị vô danh";
        const dUnit = asset.deviceId?.unit || "cái";
        assetsHtml += `<tr><td style="text-align:center">${idx+1}</td><td>${dName}</td><td style="text-align:center">${asset.quantity}</td><td style="text-align:center">${dUnit}</td></tr>`;
      });
    } else {
      assetsHtml += `<tr><td colspan="4" style="text-align:center; font-style: italic;">Chưa có thiết bị nào được ghi nhận.</td></tr>`;
    }
    assetsHtml += `</table>`;

    // Services HTML
    const fixedServices = servicesList.filter(s => s.name === "Điện" || s.name === "Nước" || s.name === "Internet" || s.name === "Vệ Sinh"); 
    const optionalServices = request.servicesInfo || [];
    
    let svHtml = `<p><strong>a) Dịch vụ cố định hàng tháng:</strong></p><ul>`;
    fixedServices.forEach((s, idx) => {
       const isPerPerson = (s.name === "Internet" || s.name === "Vệ Sinh");
       const pCount = Math.max(1, (request.coResidents?.length || 0) + 1);
       let calc = "";
       if (isPerPerson) {
         calc = `× ${pCount} người = ${(s.currentPrice * pCount).toLocaleString("vi-VN")} VNĐ/tháng `;
       }
       svHtml += `<li>${idx+1}. ${s.name}: <strong>${s.currentPrice.toLocaleString("vi-VN")}</strong> ${s.unit || "VNĐ/tháng"} ${calc}(Bắt buộc)</li>`;
    });
    svHtml += `</ul>`;

    let optSvHtml = "";
    if (optionalServices.length > 0) {
       optSvHtml += `<p><strong>b) Dịch vụ tùy chọn:</strong></p><ul>`;
       optionalServices.forEach(opt => {
         const foundS = servicesList.find(x => x._id.toString() === opt.serviceId.toString());
         if (foundS) {
           optSvHtml += `<li>${foundS.name} – ${foundS.currentPrice.toLocaleString("vi-VN")} VNĐ/tháng (Số lượng: ${opt.quantity}) = <strong>${(foundS.currentPrice * opt.quantity).toLocaleString("vi-VN")}</strong> VNĐ/tháng</li>`;
         }
       });
       optSvHtml += `</ul>`;
    }

    const qrBlockHtml = `
      <div style="border: 2px dashed #007bff; padding: 20px; text-align: center; margin-top: 30px; border-radius: 8px; background: #f0f7ff;">
        <h3 style="color: #007bff; margin-top:0;">⚡ THANH TOÁN ĐỂ CHỐT PHÒNG</h3>
        <p>Để hoàn tất thủ tục, vui lòng quét mã QR dưới đây hoặc chuyển khoản thủ công:</p>
        <img src="${qrUrl}" alt="QR Code" style="max-width: 250px; border: 1px solid #ccc; border-radius: 8px; margin: 10px 0;"/>
        <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 12px; margin: 15px auto; max-width: 420px; text-align: left;">
          <p style="margin: 4px 0;"><strong>🏦 Ngân hàng:</strong> Ngân hàng MB Bank</p>
          <p style="margin: 4px 0;"><strong>👤 Tên tài khoản:</strong> HOANG NAM ALMS</p>
          <p style="margin: 4px 0;"><strong>💳 Số tài khoản:</strong> ${process.env.BANK_ACCOUNT || "0372051662"}</p>
          <p style="margin: 4px 0;"><strong>💰 Số tiền:</strong> <span style="color: #e63946; font-size: 1.1em;">${totalAmount.toLocaleString("vi-VN")} VNĐ</span></p>
          <p style="margin: 4px 0;"><strong>📝 Nội dung chuyển khoản (bắt buộc):</strong></p>
          <p style="background: #fff; border: 2px solid #007bff; border-radius: 4px; padding: 8px 12px; font-size: 1.15em; font-weight: bold; color: #007bff; letter-spacing: 1px; text-align: center; margin: 6px 0;">${transactionCode}</p>
          <p style="font-size: 0.85em; color: #888; margin: 2px 0;">(Vui lòng nhập ĐÚNG nội dung này khi chuyển khoản để hệ thống tự động xác nhận)</p>
        </div>
        <p style="color: red; font-weight: bold; font-size: 1.05em; margin-top: 10px;">
          ⏳ LƯU Ý: Yêu cầu thanh toán và mã QR này sẽ hết hạn trong vòng 12 GIỜ. 
          Nếu không thanh toán trong thời hạn, yêu cầu sẽ tự động bị hủy và phòng trở lại trạng thái trống.
        </p>
      </div>
    `;

    const emailContent = `
      <div style="font-family: 'Times New Roman', Times, serif; line-height: 1.6; color: #000; max-width: 800px; margin: auto; padding: 20px; border: 1px solid #ddd; font-size: 16px;">
        <h3 style="text-align: center; margin-bottom: 5px; text-transform: uppercase;">Cộng hòa xã hội chủ nghĩa Việt Nam</h3>
        <p style="text-align: center; margin-top: 0; text-decoration: underline; font-weight: bold;">Độc lập - Tự do - Hạnh phúc</p>
        <h2 style="text-align: center; margin-top: 20px;">HỢP ĐỒNG THUÊ NHÀ</h2>
        <p style="text-align: center;">(Số: HĐ-${request.roomId?.name || ""}/...)</p>
        <br/>
        <p>Hôm nay, ngày ${dStr} tháng ${mStr} năm ${yStr}, tại địa chỉ quản lý tòa nhà.</p>
        <p>Chúng tôi gồm có:</p>
        <p><strong>BÊN A (Bên cho thuê):</strong> <br/> Ông/Bà: QUẢN LÝ TÒA NHÀ HOÀNG NAM <br/> Đại diện cho chủ sở hữu căn hộ.</p>
        <p><strong>BÊN B (Bên thuê):</strong></p>
        <ul>
          <li>Ông/Bà: <strong>${request.name || ""}</strong></li>
          <li>Sinh ngày: ${dobStr}</li>
          <li>CCCD/CMND: ${request.idCard || ""}</li>
          <li>Điện thoại: ${request.phone || ""}</li>
          <li>Email: ${request.email || ""}</li>
          <li>Hộ khẩu thường trú: ${request.address || ""}</li>
        </ul>
        <p><strong>Danh sách người ở cùng trong phòng (tối đa ${maxPersons} người/phòng):</strong></p>
        ${coResHtml}
        
        <p style="margin-top: 20px;">Hai bên cùng thỏa thuận ký kết hợp đồng thuê nhà với các điều khoản sau:</p>
        <p><strong>Điều 1: Bên A đồng ý cho Bên B thuê phòng số ${request.roomId?.name || ""}.</strong></p>
        <ul>
          <li>Thời hạn thuê: <strong>${request.duration}</strong> tháng, bắt đầu từ ngày <strong>${startStr}</strong> đến ngày <strong>${endStr}</strong>.</li>
          <li>Trả trước tiền phòng: <strong>${prepayMonthsNum}</strong> tháng.</li>
          <li style="list-style: none;"><em>*Lưu ý: Thời hạn tính tiền phòng đã trả sẽ bắt đầu từ ngày đầu tiên của tháng tiếp theo (nếu tạo hợp đồng vào ngày lẻ trong tháng).</em></li>
          <li>Giá thuê phòng là: <strong>${roomPrice.toLocaleString("vi-VN")}</strong> VNĐ/tháng. (Giá này cố định theo loại phòng).</li>
          <li>Tiền đặt cọc: <strong>${depositAmount.toLocaleString("vi-VN")}</strong> VNĐ <em>(Tương đương 01 tháng tiền phòng). ✓ Đã cọc</em></li>
        </ul>

        <p><strong>Điều 2: Các trang thiết bị, tài sản bàn giao kèm theo phòng:</strong></p>
        ${assetsHtml}

        <p><strong>Điều 3: Các dịch vụ hàng tháng đi kèm:</strong></p>
        ${svHtml}
        ${optSvHtml}

        ${qrBlockHtml}
      </div>
    `;

    try {
      await sendEmail(request.email, emailSubject, emailContent);
    } catch (emailErr) {
      console.error("Failed to send QR email:", emailErr);
    }

    res.status(200).json({
      success: true,
      message: "Đã chốt thông tin và tạo yêu cầu thanh toán (QR).",
      data: request
    });
  } catch (error) {
    console.error("Error sending payment info:", error);
    res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};
exports.handleSepayWebhook = async (req, res) => {
  try {
    const { content, transferAmount } = req.body;
    
    // Parse transactionCode from content – format: "Coc <RoomCode> <8digits>"
    // Ví dụ: Coc P112A 89358552
    const matchCode = content.match(/Coc\s+\S+\s+\d{8}/i);
    if (!matchCode) {
      return res.status(200).json({ success: true, message: "No matching BookingRequest transactionCode in content" });
    }
    const transactionCode = matchCode[0];

    const BookingRequest = require("../models/booking-request.model");
    const contractController = require("./contract.controller");

    // Find by transactionCode stored when QR was generated (Insensitive match)
    const bookingRequest = await BookingRequest.findOne({ transactionCode: new RegExp(`^${transactionCode}$`, "i") }).populate("roomId");
    if (!bookingRequest) {
      // Not a booking request – let normal deposit webhook handle it (return transparent)
      return res.status(200).json({ success: true, message: "Not a BookingRequest transactionCode, skipping" });
    }

    if (bookingRequest.status !== "Awaiting Payment") {
      return res.status(200).json({ success: true, message: "BookingRequest is already processed or expired" });
    }

    // Check amount
    const diff = Math.abs(transferAmount - bookingRequest.totalAmount);
    if (diff > 1000) {
      console.warn(`[SEPAY WEBHOOK] Mismatch amount. Received ${transferAmount}, Expected ${bookingRequest.totalAmount}`);
      return res.status(200).json({ success: true, message: "Amount mismatch for BookingRequest" });
    }

    // Build mock request for contractController
    const mockReq = {
      body: {
        roomId: bookingRequest.roomId._id,
        bookingRequestId: bookingRequest._id,
        tenantInfo: {
           fullName: bookingRequest.name,
           cccd: bookingRequest.idCard,
           phone: bookingRequest.phone,
           email: bookingRequest.email,
           dob: bookingRequest.dob,
           address: bookingRequest.address,
           gender: bookingRequest.gender || "Other"
        },
        coResidents: bookingRequest.coResidents || [],
        contractDetails: {
           startDate: bookingRequest.startDate,
           duration: bookingRequest.duration
        },
        bookServices: bookingRequest.servicesInfo || [],
        prepayMonths: parseInt(bookingRequest.prepayMonths, 10) || bookingRequest.duration
      }
    };

    let contractResponseStatus = 200;
    let contractResponseData = {};

    const mockRes = {
      status: (code) => {
        contractResponseStatus = code;
        return mockRes;
      },
      json: (data) => {
        contractResponseData = data;
      }
    };

    // Update Payment record for the Booking Request
    const Payment = require("../../invoice-management/models/payment.model");
    let paymentRecord = await Payment.findOne({ bookingRequestId: bookingRequest._id });
    if (paymentRecord) {
      paymentRecord.amount = transferAmount;
      paymentRecord.status = "Success";
      paymentRecord.paymentDate = new Date();
      await paymentRecord.save();
    } else {
      // Fallback in case it wasn't created initially
      paymentRecord = new Payment({
        bookingRequestId: bookingRequest._id,
        amount: transferAmount,
        transactionCode: transactionCode,
        status: "Success",
        paymentDate: new Date(),
      });
      await paymentRecord.save();
    }

    // Mark BookingRequest as Paid before calling createContract
    bookingRequest.paymentStatus = "Paid";
    await bookingRequest.save();

    // Call createContract
    await contractController.createContract(mockReq, mockRes);
    
    if (contractResponseStatus === 201 || contractResponseStatus === 200) {
      // Successfully converted → update BookingRequest status to Processed
      await BookingRequest.findByIdAndUpdate(bookingRequest._id, { status: "Processed" });
      // Ensure Payment record is marked Success (double-check)
      if (paymentRecord) {
        paymentRecord.status = "Success";
        paymentRecord.paymentDate = paymentRecord.paymentDate || new Date();
        await paymentRecord.save();
      }
      console.log(`[SEPAY WEBHOOK] BookingRequest ${bookingRequest._id} successfully processed into Contract.`);
      return res.status(200).json({ success: true, message: "Booking Request converted to Contract" });
    } else {
      console.error(`[SEPAY WEBHOOK] Failed to convert BookingRequest. Data:`, contractResponseData);
      // Payment đã nhận nhưng tạo hợp đồng lỗi → giữ paymentStatus = Paid nhưng status vẫn "Awaiting Payment" để admin xử lý thủ công
      return res.status(200).json({ success: true, message: "Payment received but contract creation failed", errorDetail: contractResponseData });
    }
  } catch (error) {
    console.error("[SEPAY WEBHOOK] Error processing BookingRequest payment:", error);
    return res.status(200).json({ success: false, message: "Internal Server Error", error: error.stack });
  }
};

// =============================================
// GET /api/booking-requests/payment-status/:transactionCode
// FE gọi polling mỗi vài giây để kiểm tra trạng thái thanh toán
// Tương tự GET /api/deposits/status/:transactionCode trong deposit flow
// =============================================
exports.getPaymentStatus = async (req, res) => {
  try {
    const { transactionCode } = req.params;

    // 1. Tìm BookingRequest theo transactionCode
    const bookingRequest = await BookingRequest.findOne({
      transactionCode: new RegExp(`^${transactionCode}$`, "i")
    }).populate("roomId");

    if (!bookingRequest) {
      return res.status(404).json({ success: false, message: "Không tìm thấy yêu cầu đặt phòng với mã này." });
    }

    // 2. Nếu đã Processed rồi → trả về ngay
    if (bookingRequest.status === "Processed") {
      return res.status(200).json({
        success: true,
        data: { status: "Processed", paymentStatus: "Paid", message: "Thanh toán đã được xác nhận, hợp đồng đã tạo." }
      });
    }

    // 3. Nếu paymentStatus đã Paid nhưng contract chưa tạo → thử tạo lại
    if (bookingRequest.paymentStatus === "Paid" && bookingRequest.status === "Awaiting Payment") {
      console.log(`[BOOKING POLLING] Payment đã Paid nhưng contract chưa tạo, thử lại cho ${transactionCode}`);
      await _triggerCreateContract(bookingRequest);
      // Reload
      const updated = await BookingRequest.findById(bookingRequest._id);
      return res.status(200).json({
        success: true,
        data: {
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          message: updated.status === "Processed" ? "Hợp đồng đã được tạo." : "Đang xử lý..."
        }
      });
    }

    // 4. Kiểm tra Payment record
    const paymentRecord = await Payment.findOne({
      bookingRequestId: bookingRequest._id,
      transactionCode: new RegExp(`^${transactionCode}$`, "i")
    });

    if (paymentRecord && paymentRecord.status === "Success") {
      // Payment đã Success nhưng BookingRequest chưa được cập nhật → tự xử lý
      console.log(`[BOOKING POLLING] Payment record Success, kích hoạt tạo hợp đồng cho ${transactionCode}`);
      bookingRequest.paymentStatus = "Paid";
      await bookingRequest.save();
      await _triggerCreateContract(bookingRequest);
      const updated = await BookingRequest.findById(bookingRequest._id);
      return res.status(200).json({
        success: true,
        data: {
          status: updated.status,
          paymentStatus: updated.paymentStatus,
          message: updated.status === "Processed" ? "Hợp đồng đã được tạo." : "Đang xử lý..."
        }
      });
    }

    // 5. Kiểm tra hết hạn
    if (bookingRequest.paymentExpiresAt && new Date() > bookingRequest.paymentExpiresAt && bookingRequest.status === "Awaiting Payment") {
      await BookingRequest.findByIdAndUpdate(bookingRequest._id, { status: "Expired" });
      if (paymentRecord && paymentRecord.status === "Pending") {
        paymentRecord.status = "Failed";
        await paymentRecord.save();
      }
      return res.status(200).json({
        success: true,
        data: { status: "Expired", paymentStatus: "Unpaid", message: "Yêu cầu đã hết hạn thanh toán." }
      });
    }

    // 6. Còn đang chờ
    const expiresAt = bookingRequest.paymentExpiresAt;
    const expireInSeconds = expiresAt ? Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000)) : null;

    return res.status(200).json({
      success: true,
      data: {
        status: bookingRequest.status,               // "Awaiting Payment"
        paymentStatus: bookingRequest.paymentStatus, // "Unpaid"
        transactionCode: bookingRequest.transactionCode,
        totalAmount: bookingRequest.totalAmount,
        expireAt: expiresAt,
        expireInSeconds,
        message: "Đang chờ thanh toán..."
      }
    });
  } catch (error) {
    console.error("[BOOKING POLLING] Error:", error);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =============================================
// Helper nội bộ: Tạo hợp đồng từ BookingRequest (dùng chung webhook & polling)
// =============================================
async function _triggerCreateContract(bookingRequest) {
  try {
    const contractController = require("./contract.controller");

    const mockReq = {
      body: {
        roomId: bookingRequest.roomId._id || bookingRequest.roomId,
        bookingRequestId: bookingRequest._id,
        tenantInfo: {
          fullName: bookingRequest.name,
          cccd: bookingRequest.idCard,
          phone: bookingRequest.phone,
          email: bookingRequest.email,
          dob: bookingRequest.dob,
          address: bookingRequest.address,
          gender: bookingRequest.gender || "Other"
        },
        coResidents: bookingRequest.coResidents || [],
        contractDetails: {
          startDate: bookingRequest.startDate,
          duration: bookingRequest.duration
        },
        bookServices: bookingRequest.servicesInfo || [],
        prepayMonths: parseInt(bookingRequest.prepayMonths, 10) || bookingRequest.duration
      }
    };

    let contractResponseStatus = 200;
    const mockRes = {
      status: (code) => { contractResponseStatus = code; return mockRes; },
      json: () => {}
    };

    await contractController.createContract(mockReq, mockRes);

    if (contractResponseStatus === 201 || contractResponseStatus === 200) {
      await BookingRequest.findByIdAndUpdate(bookingRequest._id, { status: "Processed" });
      console.log(`[BOOKING POLLING] ✅ Contract created for BookingRequest ${bookingRequest._id}`);
    } else {
      console.warn(`[BOOKING POLLING] ⚠️ createContract returned ${contractResponseStatus}`);
    }
  } catch (err) {
    console.error("[BOOKING POLLING] ❌ _triggerCreateContract error:", err.message);
  }
}

