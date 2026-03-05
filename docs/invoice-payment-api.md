# Invoice API — Hóa Đơn & Thanh Toán

## Tổng Quan

API quản lý hóa đơn cho Tenant: xem danh sách, chi tiết, và thanh toán hóa đơn phát sinh qua Sepay QR.

> **Loại hóa đơn:**
> - `Periodic` — Hóa đơn định kỳ hàng tháng (tiền phòng + dịch vụ)
> - `Incurred` — Hóa đơn phát sinh từ yêu cầu sửa chữa/thiết bị hỏng
>
> **Trạng thái hóa đơn:**
> - `Draft` — Nháp (Quản lý chưa phát hành) → **Tenant KHÔNG thấy**
> - `Unpaid` — Chưa thanh toán → Hiển thị cho Tenant
> - `Paid` — Đã thanh toán
> - `Overdue` — Quá hạn
> - `Cancelled` — Đã hủy

---

## Base URL

```
Development: http://localhost:9999/api
Production:  https://your-domain.com/api
```

---

## Danh Sách Endpoints

### Hóa đơn

| # | Method | Endpoint | Mô tả |
|---|--------|----------|-------|
| 1 | GET | `/invoices/tenant/:tenantId` | Danh sách hóa đơn của Tenant (phân trang) |
| 2 | GET | `/invoices/my/:id` | Chi tiết hóa đơn (Tenant tự xem, cần đăng nhập) |
| 3 | GET | `/invoices/:id/incurred` | Chi tiết hóa đơn phát sinh (gồm RepairRequest + Device) |

### Thanh toán QR (Tất cả hóa đơn)

| # | Method | Endpoint | Mô tả |
|---|--------|----------|-------|
| 4 | POST | `/invoices/:id/payment/initiate` | Khởi tạo thanh toán → nhận QR |
| 5 | GET | `/invoices/payment/status/:transactionCode` | Polling kiểm tra trạng thái |
| 6 | POST | `/invoices/payment/cancel/:transactionCode` | Hủy giao dịch đang Pending |
| 7 | POST | `/webhook/sepay` | ⚠️ Nội bộ — Sepay gọi tự động (webhook chung) |

---

## Endpoints Chi Tiết — Hóa Đơn

---

### 1. Danh Sách Hóa Đơn Của Tenant

Lấy tất cả hóa đơn của tenant (bao gồm cả Periodic và Incurred). **Hóa đơn trạng thái `Draft` sẽ KHÔNG được trả về.**

```
GET /invoices/tenant/:tenantId
```

#### Path Parameters
| Parameter | Type | Mô tả |
|-----------|------|-------|
| tenantId | string | ObjectId của User (role Tenant) |

#### Query Parameters
| Parameter | Type | Default | Mô tả |
|-----------|------|---------|-------|
| page | number | 1 | Trang hiện tại |
| limit | number | 10 | Số hóa đơn mỗi trang |

#### Request Example
```
GET /invoices/tenant/69a9953b1a42128b79652850?page=1&limit=10
```

#### Response Success (200)
```json
{
  "success": true,
  "data": [
    {
      "_id": "69a99ce48cdd1267f6e514b2",
      "invoiceCode": "INV-Phòng 310-32026-2223",
      "contractId": "69a9953b1a42128b79652850",
      "roomId": {
        "_id": "69a680b62327a1f0e037f3ac",
        "name": "Phòng 310"
      },
      "title": "Hóa đơn tiền thuê & dịch vụ tháng 3/2026",
      "type": "Periodic",
      "totalAmount": 2906612.90,
      "status": "Unpaid",
      "dueDate": "2026-04-04T17:00:00.000Z",
      "createdAt": "2026-03-05T15:10:28.279Z"
    },
    {
      "_id": "69a99cddd832c0de61cf2113",
      "invoiceCode": "INV-RP-0001",
      "roomId": {
        "_id": "69a680b62327a1f0e037f3ac",
        "name": "Phòng 310"
      },
      "repairRequestId": "69a99d146b1cddc0e772361e",
      "title": "Sửa chữa điều hoà",
      "type": "Incurred",
      "totalAmount": 100000,
      "status": "Unpaid",
      "dueDate": "2026-03-12T00:00:00.000Z",
      "createdAt": "2026-03-05T15:10:21.862Z"
    }
  ],
  "pagination": {
    "total": 2,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

> **Lưu ý:** Hóa đơn `Draft` không xuất hiện trong kết quả. Chỉ hiển thị hóa đơn đã được phát hành (`Unpaid`, `Paid`, `Overdue`, `Cancelled`).

#### Response Errors
| Status | Trường hợp |
|--------|------------|
| 500 | Lỗi server |

---

### 2. Chi Tiết Hóa Đơn (Tenant Tự Xem)

Tenant xem chi tiết 1 hóa đơn của mình. Hệ thống tự kiểm tra quyền sở hữu qua JWT token.

```
GET /invoices/my/:id
```

#### Headers
| Header | Giá trị |
|--------|--------|
| Authorization | `Bearer {accessToken}` |

#### Path Parameters
| Parameter | Type | Mô tả |
|-----------|------|-------|
| id | string | ObjectId của hóa đơn (`Invoice._id`) |

#### Response Success (200)
```json
{
  "success": true,
  "data": {
    "_id": "69a99ce48cdd1267f6e514b2",
    "invoiceCode": "INV-Phòng 310-32026-2223",
    "roomId": {
      "_id": "69a680b62327a1f0e037f3ac",
      "name": "Phòng 310",
      "roomCode": "P310",
      "floorId": { "_id": "...", "name": "Tầng 3" },
      "roomTypeId": { "_id": "...", "typeName": "Phòng đơn", "currentPrice": 2500000 }
    },
    "title": "Hóa đơn tiền thuê & dịch vụ tháng 3/2026",
    "type": "Periodic",
    "items": [
      {
        "itemName": "Tiền thuê phòng",
        "usage": 1,
        "unitPrice": 2500000,
        "amount": 2500000
      }
    ],
    "totalAmount": 2906612.90,
    "status": "Unpaid",
    "dueDate": "2026-04-04T17:00:00.000Z",
    "contractCode": "HD-001",
    "contractStartDate": "2026-03-01T00:00:00.000Z",
    "contractEndDate": "2026-09-01T00:00:00.000Z"
  }
}
```

#### Response Errors
| Status | Trường hợp |
|--------|------------|
| 401 | Chưa đăng nhập |
| 403 | Không có quyền xem hóa đơn này |
| 404 | Không tìm thấy hóa đơn |
| 500 | Lỗi server |

---

### 3. Chi Tiết Hóa Đơn Phát Sinh (Incurred)

Trả về thông tin tối ưu cho hóa đơn phát sinh, bao gồm RepairRequest và Device.

```
GET /invoices/:id/incurred
```

#### Path Parameters
| Parameter | Type | Mô tả |
|-----------|------|-------|
| id | string | ObjectId của hóa đơn (`Invoice._id`) |

#### Response Success (200)
```json
{
  "success": true,
  "data": {
    "invoiceCode": "INV-RP-0001",
    "roomName": "Phòng 310",
    "title": "Sửa chữa điều hoà",
    "type": "Incurred",
    "totalAmount": 100000,
    "status": "Unpaid",
    "dueDate": "2026-03-12T00:00:00.000Z",
    "createdAt": "2026-03-05T15:10:21.862Z",
    "deviceName": "Điều hoà Daikin",
    "description": "Hỏng cụm nén, cần thay thế"
  }
}
```

#### Response Errors
| Status | Trường hợp |
|--------|------------|
| 400 | Hóa đơn không phải loại `Incurred` |
| 404 | Không tìm thấy hóa đơn |

---

## Endpoints Chi Tiết — Thanh Toán QR

---

### 4. Khởi Tạo Thanh Toán Hóa Đơn

Tạo giao dịch thanh toán và nhận QR code chuyển khoản. QR có hiệu lực **5 phút**.
Áp dụng cho **cả 2 loại** hóa đơn: `Periodic` (định kỳ) và `Incurred` (phát sinh).

```
POST /invoices/:id/payment/initiate
```

#### Path Parameters
| Parameter | Type | Mô tả |
|-----------|------|-------|
| id | string | ObjectId của hóa đơn (`Invoice._id`) |

#### Điều kiện hóa đơn hợp lệ
- `status` phải là `"Unpaid"` (chưa thanh toán)
- Hóa đơn `Draft` / `Paid` / `Cancelled` sẽ bị từ chối

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

| 400 | Hóa đơn không ở trạng thái `Unpaid` (ví dụ đã `Paid` hoặc `Draft`) |
| 404 | Không tìm thấy hóa đơn |
| 500 | Lỗi server |

---

### 5. Kiểm Tra Trạng Thái Giao Dịch (Polling)

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

### 6. Hủy Giao Dịch

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

### 7. Webhook Sepay — Xác Nhận Thanh Toán *(Nội Bộ)*

> ⚠️ **Endpoint này chỉ dành cho Sepay gọi tự động. Frontend KHÔNG gọi endpoint này.**
>
> Đã chuyển sang **webhook chung** cho tất cả loại thanh toán (cọc + hóa đơn):

```
POST /webhook/sepay
```

Hệ thống tự phân biệt loại giao dịch qua nội dung chuyển khoản:
- `Coc ...` → Đặt cọc phòng
- `HD ...` → Thanh toán hóa đơn phát sinh

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
