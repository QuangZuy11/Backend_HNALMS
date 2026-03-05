# Invoice Payment API — Thanh Toán Hóa Đơn Phát Sinh

## Tổng Quan

API này xử lý việc **thanh toán hóa đơn phát sinh (Incurred)** thông qua cổng thanh toán Sepay với mã QR chuyển khoản ngân hàng (VietQR).

> **Lưu ý loại hóa đơn:**
> - `Periodic` — Hóa đơn định kỳ hàng tháng (tiền phòng + dịch vụ) → **Luồng thanh toán khác, không dùng API này**
> - `Incurred` — Hóa đơn phát sinh từ yêu cầu sửa chữa/thiết bị hỏng → **Dùng API này**

---

## Base URL

```
Development: http://localhost:9999/api
Production:  https://your-domain.com/api
```

---

## Danh Sách Endpoints

| # | Method | Endpoint | Mô tả |
|---|--------|----------|-------|
| 1 | POST | `/invoices/:id/payment/initiate` | Khởi tạo thanh toán → nhận QR |
| 2 | GET | `/invoices/payment/status/:transactionCode` | Polling kiểm tra trạng thái |
| 3 | POST | `/invoices/payment/cancel/:transactionCode` | Hủy giao dịch đang Pending |
| 4 | POST | `/invoices/webhook/sepay` | ⚠️ Nội bộ — Sepay gọi tự động |

---

## Endpoints Chi Tiết

---

### 1. Khởi Tạo Thanh Toán Hóa Đơn

Tạo giao dịch thanh toán và nhận QR code chuyển khoản. QR có hiệu lực **5 phút**.

```
POST /invoices/:id/payment/initiate
```

#### Path Parameters
| Parameter | Type | Mô tả |
|-----------|------|-------|
| id | string | ObjectId của hóa đơn (`Invoice._id`) |

#### Điều kiện hóa đơn hợp lệ
- `type` phải là `"Incurred"` (hóa đơn phát sinh)
- `status` phải là `"Unpaid"` (chưa thanh toán)

#### Response Success (201)
```json
{
  "success": true,
  "message": "Khởi tạo thanh toán thành công. Vui lòng quét QR để thanh toán.",
  "data": {
    "paymentId": "67c1a2b3c4d5e6f7a8b9c0d1",
    "transactionCode": "HD INV320 05032026",
    "invoiceAmount": 350000,
    "invoiceCode": "INV-2026-320",
    "roomName": "Phòng 310",
    "qrUrl": "https://img.vietqr.io/image/970418-4270992356-qr_only.jpg?amount=350000&addInfo=HD%20INV320%2005032026&accountName=PHAM%20QUANG%20DUY",
    "bankInfo": {
      "bankBin": "970418",
      "bankAccount": "4270992356",
      "bankAccountName": "PHAM QUANG DUY",
      "content": "HD INV320 05032026"
    },
    "expireAt": "2026-03-05T10:05:00.000Z",
    "expireInSeconds": 300,
    "expireNote": "Giao dịch cần được xác nhận trong 5 phút"
  }
}
```

> **Trường hợp đặc biệt (200):** Nếu đã có giao dịch `Pending` còn hạn → trả về lại QR cũ thay vì tạo mới.

#### Response Errors
| Status | Trường hợp |
|--------|-----------|
| 400 | Hóa đơn không phải loại `Incurred` |
| 400 | Hóa đơn không ở trạng thái `Unpaid` (ví dụ đã `Paid` hoặc `Draft`) |
| 404 | Không tìm thấy hóa đơn |
| 500 | Lỗi server |

---

### 2. Kiểm Tra Trạng Thái Giao Dịch (Polling)

Frontend gọi định kỳ (3–5 giây) để biết giao dịch đã được xác nhận chưa.

```
GET /invoices/payment/status/:transactionCode
```

#### Path Parameters
| Parameter | Type | Mô tả |
|-----------|------|-------|
| transactionCode | string | Mã giao dịch (VD: `HD INV320 05032026`) |

> **Lưu ý:** Encode URL trước khi đặt vào path. Dấu cách → `%20`.
> ```
> GET /invoices/payment/status/HD%20INV320%2005032026
> ```

#### Response — Đang chờ thanh toán (Pending)
```json
{
  "success": true,
  "data": {
    "status": "Pending",
    "paymentId": "67c1a2b3c4d5e6f7a8b9c0d1",
    "transactionCode": "HD INV320 05032026",
    "amount": 350000,
    "invoice": {
      "_id": "67b9c0d1e2f3a4b5c6d7e8f9",
      "invoiceCode": "INV-2026-320",
      "status": "Unpaid",
      "type": "Incurred",
      "totalAmount": 350000
    },
    "expireInSeconds": 185
  }
}
```

#### Response — Đã thanh toán thành công (Success)
```json
{
  "success": true,
  "data": {
    "status": "Success",
    "paymentId": "67c1a2b3c4d5e6f7a8b9c0d1",
    "transactionCode": "HD INV320 05032026",
    "amount": 350000,
    "paymentDate": "2026-03-05T10:03:27.000Z",
    "invoice": {
      "_id": "67b9c0d1e2f3a4b5c6d7e8f9",
      "invoiceCode": "INV-2026-320",
      "status": "Paid",
      "type": "Incurred",
      "totalAmount": 350000
    }
  }
}
```

#### Response — Hết hạn (Expired)
```json
{
  "success": true,
  "data": {
    "status": "Expired",
    "message": "Giao dịch đã hết hạn thanh toán.",
    "transactionCode": "HD INV320 05032026"
  }
}
```

#### Bảng trạng thái
| `status` | Mô tả | Hành động FE |
|----------|-------|-------------|
| `Pending` | Đang chờ chuyển khoản | Tiếp tục polling |
| `Success` | Đã thanh toán thành công | Dừng polling, hiển thị thành công |
| `Expired` | Hết 5 phút chưa thanh toán, giao dịch tự hủy | Dừng polling, thông báo hết hạn |
| `Failed` | Giao dịch thất bại | Dừng polling, cho phép thử lại |

#### Response Errors
| Status | Trường hợp |
|--------|-----------|
| 404 | Không tìm thấy giao dịch (đã `Expired` hoặc bị xóa) |
| 500 | Lỗi server |

---

### 3. Hủy Giao Dịch

Frontend gọi khi user **tự đóng modal QR** trước khi thanh toán.

```
POST /invoices/payment/cancel/:transactionCode
```

#### Path Parameters
| Parameter | Type | Mô tả |
|-----------|------|-------|
| transactionCode | string | Mã giao dịch cần hủy |

> Encode URL tương tự endpoint polling.

#### Response Success (200)
```json
{
  "success": true,
  "message": "Đã hủy giao dịch thanh toán hóa đơn.",
  "data": {
    "transactionCode": "HD INV320 05032026",
    "status": "Cancelled"
  }
}
```

#### Behavior
- Xóa Payment record khỏi database
- **Không cập nhật** Invoice (vẫn giữ trạng thái `Unpaid`)
- Chỉ có thể hủy giao dịch đang ở trạng thái `Pending`

#### Response Errors
| Status | Trường hợp |
|--------|-----------|
| 404 | Giao dịch không tồn tại hoặc đã hoàn tất |
| 500 | Lỗi server |

---

### 4. Webhook Sepay — Xác Nhận Thanh Toán *(Nội Bộ)*

> ⚠️ **Endpoint này chỉ dành cho Sepay gọi tự động. Frontend KHÔNG gọi endpoint này.**

```
POST /invoices/webhook/sepay
```

Khi Sepay phát hiện biến động số dư ngân hàng khớp với mã giao dịch hóa đơn, endpoint này sẽ:
1. Cập nhật `Payment.status` → `"Success"`
2. Cập nhật `Invoice.status` → `"Paid"`
3. Cập nhật `RepairRequest.status` → `"Paid"` (nếu hóa đơn liên kết với yêu cầu sửa chữa)

#### Authorization
| Header | Giá trị |
|--------|---------|
| Authorization | `Apikey {SEPAY_WEBHOOK_TOKEN}` |

#### Request Body từ Sepay
```json
{
  "id": 789012,
  "transferAmount": 350000,
  "content": "HD INV320 05032026 chuyen khoan",
  "transferType": "in"
}
```

#### Cơ chế khớp giao dịch
- Sepay truyền `content` (nội dung chuyển khoản của khách)
- Hệ thống dùng regex `/HD\s+\S+\s+\d{8}/i` để tìm mã giao dịch trong chuỗi content
- Cho phép sai lệch số tiền **±1.000đ**

#### Ví dụ nội dung CK được hệ thống nhận ra
```
"HD INV320 05032026"            ✅ Khớp
"chuyen tien HD INV320 05032026" ✅ Khớp (có text phụ trước)
"HD INV320 05032026 thanh toan"  ✅ Khớp (có text phụ sau)
"HDINV32005032026"               ❌ Không khớp (thiếu khoảng trắng)
"TT INV320 05032026"             ❌ Không khớp (sai prefix)
```

---

## Luồng Tích Hợp Frontend

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: User xem chi tiết hóa đơn phát sinh                    │
│  → Kiểm tra: type = "Incurred" VÀ status = "Unpaid"             │
│  → Hiển thị nút "Thanh toán ngay"                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 2: User click "Thanh toán ngay"                           │
│  → POST /api/invoices/:invoiceId/payment/initiate               │
│  → Nhận về: transactionCode, invoiceAmount, qrUrl, expireAt     │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  STEP 3: Hiển thị Modal QR                                      │
│  - Ảnh QR (từ qrUrl)                                            │
│  - Tên ngân hàng: BIDV                                          │
│  - Số tài khoản (bankInfo.bankAccount)                          │
│  - Chủ tài khoản (bankInfo.bankAccountName)                     │
│  - Số tiền (invoiceAmount)                                      │
│  - Nội dung chuyển khoản (transactionCode) ← QUAN TRỌNG        │
│  - Đếm ngược thời gian (expireInSeconds)                        │
│  - Nút "Đóng / Hủy"                                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
              ┌───────────────┴───────────────┐
              ↓                               ↓
┌─────────────────────────┐     ┌─────────────────────────────────┐
│  User click "Đóng/Hủy"  │     │  STEP 4: Polling mỗi 3–5 giây  │
│          ↓              │     │  GET /api/invoices/payment/     │
│  POST /payment/cancel/  │     │      status/:transactionCode    │
│         :code           │     └─────────────────────────────────┘
│          ↓              │                   ↓
│  → Payment bị XÓA       │        ┌──────────┴──────────┐
│  → Invoice vẫn "Unpaid" │        ↓                     ↓
│  → Thông báo "Đã hủy"   │  status = "Success"    status = "Expired"
└─────────────────────────┘        ↓                     ↓
                              Dừng polling          Dừng polling
                              Hiển thị "Thành       Thông báo
                              công ✅"               "Hết hạn ⏰"
                              Cập nhật UI           Cho phép
                              Invoice → Paid        thử lại
```

---

## Code Mẫu — React/Next.js

```jsx
import { useState, useEffect, useRef } from 'react';

const InvoicePaymentModal = ({ invoiceId, invoiceAmount, invoiceCode, onClose, onSuccess }) => {
  const [paymentData, setPaymentData] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | pending | success | expired | cancelled
  const intervalRef = useRef(null);
  const timeoutRef = useRef(null);

  // Khởi tạo thanh toán
  useEffect(() => {
    const initiate = async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/payment/initiate`, {
          method: 'POST',
        });
        const data = await res.json();

        if (data.success) {
          setPaymentData(data.data);
          setStatus('pending');
        } else {
          alert(data.message || 'Không thể khởi tạo thanh toán');
          onClose();
        }
      } catch (err) {
        console.error(err);
        alert('Lỗi kết nối, vui lòng thử lại');
        onClose();
      }
    };

    initiate();
  }, [invoiceId]);

  // Polling trạng thái thanh toán
  useEffect(() => {
    if (status !== 'pending' || !paymentData) return;

    const encodedCode = encodeURIComponent(paymentData.transactionCode);

    intervalRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/invoices/payment/status/${encodedCode}`);
        const data = await res.json();
        const txStatus = data.data?.status;

        if (txStatus === 'Success') {
          clearInterval(intervalRef.current);
          clearTimeout(timeoutRef.current);
          setStatus('success');
          onSuccess?.();
        } else if (txStatus === 'Expired') {
          clearInterval(intervalRef.current);
          clearTimeout(timeoutRef.current);
          setStatus('expired');
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
    }, 3000);

    // Tự động dừng sau 5 phút (failsafe)
    timeoutRef.current = setTimeout(() => {
      clearInterval(intervalRef.current);
      setStatus('expired');
    }, 5 * 60 * 1000);

    return () => {
      clearInterval(intervalRef.current);
      clearTimeout(timeoutRef.current);
    };
  }, [status, paymentData]);

  // Hủy giao dịch khi đóng modal
  const handleCancel = async () => {
    clearInterval(intervalRef.current);
    clearTimeout(timeoutRef.current);

    if (paymentData?.transactionCode && status === 'pending') {
      try {
        const encodedCode = encodeURIComponent(paymentData.transactionCode);
        await fetch(`/api/invoices/payment/cancel/${encodedCode}`, { method: 'POST' });
      } catch (err) {
        console.error('Cancel error:', err);
      }
    }

    setStatus('cancelled');
    onClose();
  };

  // --- Loading ---
  if (status === 'loading') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <p>Đang tạo mã QR thanh toán...</p>
        </div>
      </div>
    );
  }

  // --- Thành công ---
  if (status === 'success') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h2>✅ Thanh toán thành công!</h2>
          <p>Hóa đơn <strong>{invoiceCode}</strong> đã được thanh toán.</p>
          <p>Số tiền: <strong>{invoiceAmount?.toLocaleString('vi-VN')} đ</strong></p>
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  // --- Hết hạn ---
  if (status === 'expired') {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <h2>⏰ Giao dịch hết hạn</h2>
          <p>Phiên thanh toán đã hết 5 phút. Vui lòng thử lại.</p>
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    );
  }

  // --- QR Modal (Pending) ---
  if (status === 'pending' && paymentData) {
    return (
      <div className="modal-overlay">
        <div className="modal">
          <button className="close-btn" onClick={handleCancel}>✕</button>

          <h2>Thanh toán hóa đơn phát sinh</h2>
          <p>Hóa đơn: <strong>{paymentData.invoiceCode}</strong></p>
          <p>Phòng: <strong>{paymentData.roomName}</strong></p>

          {/* QR Code */}
          <img
            src={paymentData.qrUrl}
            alt="QR Thanh toán"
            style={{ width: 200, height: 200 }}
          />

          {/* Thông tin chuyển khoản */}
          <div className="bank-info">
            <p>🏦 <strong>Ngân hàng:</strong> BIDV</p>
            <p>💳 <strong>Số TK:</strong> {paymentData.bankInfo.bankAccount}</p>
            <p>👤 <strong>Chủ TK:</strong> {paymentData.bankInfo.bankAccountName}</p>
            <p>💰 <strong>Số tiền:</strong> {paymentData.invoiceAmount?.toLocaleString('vi-VN')} đ</p>
            <p>📝 <strong>Nội dung CK:</strong>
              <code style={{ background: '#f0f0f0', padding: '2px 6px', borderRadius: 4 }}>
                {paymentData.transactionCode}
              </code>
              <button onClick={() => navigator.clipboard.writeText(paymentData.transactionCode)}>
                📋 Copy
              </button>
            </p>
          </div>

          {/* Đồng hồ đếm ngược */}
          <CountdownTimer seconds={paymentData.expireInSeconds} />

          <p className="hint">⏳ Đang chờ xác nhận thanh toán...</p>
          <button className="btn-cancel" onClick={handleCancel}>Hủy thanh toán</button>
        </div>
      </div>
    );
  }

  return null;
};

export default InvoicePaymentModal;
```

### Hàm đếm ngược thời gian

```jsx
import { useState, useEffect } from 'react';

const CountdownTimer = ({ seconds: initialSeconds }) => {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setInterval(() => setSeconds(s => s - 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const isWarning = seconds <= 60;

  return (
    <p style={{ color: isWarning ? 'red' : 'inherit', fontWeight: 'bold' }}>
      ⏱ Hết hạn sau: {minutes}:{String(secs).padStart(2, '0')}
      {isWarning && ' — Sắp hết hạn!'}
    </p>
  );
};
```

---

## Mã Giao Dịch (Transaction Code)

### Format
```
HD [InvoiceCode rút gọn] [DDMMYYYY]
```

### Ví dụ
| InvoiceCode gốc | Transaction Code | Ngày |
|-----------------|-----------------|------|
| `INV-2026-320` | `HD INV2026320 05032026` | 05/03/2026 |
| `Phòng 310 - T03` | `HD 310T03 05032026` | 05/03/2026 |

### Lưu ý khi nhập nội dung chuyển khoản
- **BẮT BUỘC** nhập đúng nội dung `transactionCode` trả về từ API
- Không bắt buộc nhập chính xác 100% — Sepay và hệ thống sẽ **tìm kiếm** mã trong nội dung
- Cho phép thêm chữ trước/sau mã giao dịch (VD: `Thanh toan HD INV2026320 05032026`)
- **Không rút gọn hoặc thay đổi** các ký tự trong mã giao dịch

---

## Mô Hình Dữ Liệu

### Invoice (Hóa Đơn)
```javascript
{
  _id: ObjectId,
  invoiceCode: String,         // Mã hóa đơn (VD: "INV-2026-320")
  roomId: ObjectId,            // Ref → Room
  repairRequestId: ObjectId,   // Ref → RepairRequest (chỉ có với Incurred)
  type: "Incurred",            // Loại hóa đơn
  title: String,               // Tiêu đề (VD: "Sửa điều hòa phòng 310")
  totalAmount: Number,         // Số tiền cần thanh toán
  status: Enum,                // "Draft" | "Unpaid" | "Paid" | "Overdue" | "Cancelled"
  dueDate: Date,               // Hạn thanh toán
  createdAt: Date,
  updatedAt: Date
}
```

### Payment (Giao Dịch Thanh Toán)
```javascript
{
  _id: ObjectId,
  invoiceId: ObjectId,         // Ref → Invoice
  depositId: ObjectId,         // Ref → Deposit (null với invoice payment)
  amount: Number,              // Số tiền giao dịch
  transactionCode: String,     // Mã giao dịch unique (VD: "HD INV320 05032026")
  status: Enum,                // "Pending" | "Success" | "Failed"
  paymentDate: Date,           // Thời điểm xác nhận (null khi Pending)
  createdAt: Date,
  updatedAt: Date
}
```

### RepairRequest (Yêu Cầu Sửa Chữa)
```javascript
{
  _id: ObjectId,
  roomId: ObjectId,
  deviceId: ObjectId,          // Thiết bị liên quan
  title: String,
  description: String,
  status: Enum,                // "Pending" | "Processing" | "Done" | "Unpaid" | "Paid"
  // status → "Paid" sau khi thanh toán hóa đơn phát sinh
}
```

---

## Vòng Đời Trạng Thái

### Invoice Status
```
Draft → Unpaid → Paid
              ↘ Overdue (quá hạn)
              ↘ Cancelled
```

### Payment Status
```
Pending → Success  (Sepay xác nhận, invoice → Paid)
        ↘ (XÓA)    (người dùng hủy hoặc hết 5 phút)
```

### RepairRequest Status (liên quan)
```
Unpaid → Paid  (sau khi thanh toán invoice Incurred)
```

---

## Điều Kiện Lỗi Thường Gặp

| Lỗi | Nguyên nhân | Giải pháp |
|-----|------------|-----------|
| `400` — Hóa đơn không phải loại Incurred | Dùng API này cho hóa đơn Periodic | Dùng flow khác cho Periodic |
| `400` — Hóa đơn không ở trạng thái Unpaid | Hóa đơn đã `Paid` hoặc còn ở `Draft` | Kiểm tra trạng thái trước khi nút thanh toán hiển thị |
| `404` khi polling | Giao dịch đã `Expired` và bị xóa | Hiển thị thông báo hết hạn, cho phép tạo lại |
| QR không quét được | Bank app không hỗ trợ VietQR | Hướng dẫn nhập tay thông tin ngân hàng |
| Số tiền lệch | Nhập sai số tiền | Nhắc nhở người dùng nhập đúng số tiền trên QR |

---

## Environment Variables

```env
SEPAY_WEBHOOK_TOKEN=your_sepay_api_key
BANK_BIN=970418
BANK_ACCOUNT=4270992356
BANK_ACCOUNT_NAME=PHAM QUANG DUY
```

### Bank BIN Tham Khảo
| Ngân hàng | BIN |
|-----------|-----|
| BIDV | 970418 |
| MBBank | 970422 |
| Vietcombank | 970436 |
| Techcombank | 970407 |
| TPBank | 970423 |
| ACB | 970416 |
