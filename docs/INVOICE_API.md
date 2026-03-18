# API Hóa Đơn

## Tổng quan

Hệ thống hóa đơn được chia thành 2 loại:
- **Hóa đơn định kỳ (Periodic):** Tiền thuê phòng & dịch vụ hàng tháng
- **Hóa đơn phát sinh (Incurred):** Sửa chữa, đền bù, phạt vi phạm...

---

## 1. Hóa đơn định kỳ (Periodic)

### 1.1 Lấy danh sách hóa đơn định kỳ

**Endpoint:** `GET /api/invoices/periodic`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | Number | Số trang (default: 1) |
| `limit` | Number | Số lượng mỗi trang (default: 10) |

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "_id": "...",
            "invoiceCode": "INV-Phong_101-32026",
            "contractId": "...",
            "title": "Hóa đơn tiền thuê & dịch vụ tháng 3/2026",
            "items": [
                {
                    "itemName": "Tiền thuê phòng",
                    "oldIndex": 0,
                    "newIndex": 0,
                    "usage": 1,
                    "unitPrice": 3000000,
                    "amount": 3000000,
                    "isIndex": false
                },
                {
                    "itemName": "Tiền điện",
                    "oldIndex": 100,
                    "newIndex": 150,
                    "usage": 50,
                    "unitPrice": 3500,
                    "amount": 175000,
                    "isIndex": true
                }
            ],
            "totalAmount": 3175000,
            "status": "Unpaid",
            "dueDate": "2026-04-05T00:00:00.000Z",
            "createdAt": "2026-03-18T09:00:00.000Z"
        }
    ]
}
```

---

### 1.2 Tạo hóa đơn nháp định kỳ (Admin/Manager)

**Endpoint:** `POST /api/invoices/periodic/generate-drafts`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "message": "Tạo thành công 5 hóa đơn nháp định kỳ"
}
```

---

### 1.3 Phát hành hóa đơn định kỳ

**Endpoint:** `PUT /api/invoices/periodic/:id/release`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": {
        "_id": "...",
        "status": "Unpaid"
    },
    "message": "Phát hành hóa đơn thành công!"
}
```

---

### 1.4 Xem chi tiết hóa đơn định kỳ

**Endpoint:** `GET /api/invoices/periodic/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": {
        "_id": "...",
        "invoiceCode": "INV-Phong_101-32026",
        "contractId": {
            "_id": "...",
            "contractCode": "HN/Phòng 101/2026/HDSV/123",
            "startDate": "2026-01-01T00:00:00.000Z",
            "endDate": "2027-01-01T00:00:00.000Z",
            "roomId": {
                "_id": "...",
                "name": "Phòng 101",
                "roomCode": "Phong_101",
                "floorId": {...},
                "roomTypeId": {...}
            }
        },
        "title": "Hóa đơn tiền thuê & dịch vụ tháng 3/2026",
        "items": [...],
        "totalAmount": 3175000,
        "status": "Unpaid",
        "dueDate": "2026-04-05T00:00:00.000Z",
        "type": "Periodic",
        "tenant": {
            "_id": "...",
            "username": "tenant001",
            "email": "tenant@example.com",
            "phoneNumber": "0912345678"
        }
    }
}
```

---

### 1.5 Lấy hóa đơn theo TenantId (Admin/Manager)

**Endpoint:** `GET /api/invoices/periodic/tenant/:tenantId`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | Number | Số trang (default: 1) |
| `limit` | Number | Số lượng mỗi trang (default: 10) |

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": [...],
    "pagination": {
        "current_page": 1,
        "total_pages": 1,
        "total_count": 2,
        "limit": 10
    }
}
```

---

### 1.6 Tenant xem chi tiết hóa đơn của mình

**Endpoint:** `GET /api/invoices/periodic/my/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": {
        "_id": "...",
        "invoiceCode": "INV-Phong_101-32026",
        "title": "Hóa đơn tiền thuê & dịch vụ tháng 3/2026",
        "items": [...],
        "totalAmount": 3175000,
        "status": "Unpaid",
        "dueDate": "2026-04-05T00:00:00.000Z",
        "type": "Periodic",
        "contractCode": "HN/Phòng 101/2026/HDSV/123",
        "contractStartDate": "2026-01-01T00:00:00.000Z",
        "contractEndDate": "2027-01-01T00:00:00.000Z"
    }
}
```

---

### 1.7 Xác nhận thanh toán hóa đơn định kỳ

**Endpoint:** `PUT /api/invoices/periodic/:id/pay`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "message": "Xác nhận thanh toán hóa đơn định kỳ thành công!",
    "data": {
        "_id": "...",
        "status": "Paid"
    }
}
```

---

## 2. Hóa đơn phát sinh (Incurred)

### 2.1 Lấy danh sách hóa đơn phát sinh

**Endpoint:** `GET /api/invoices/incurred`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | Number | Số trang (default: 1) |
| `limit` | Number | Số lượng mỗi trang (default: 10) |

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": [
        {
            "_id": "...",
            "invoiceCode": "INC-001",
            "contractId": "...",
            "title": "Hóa đơn sửa chữa",
            "totalAmount": 500000,
            "status": "Unpaid",
            "type": "repair",
            "dueDate": "2026-04-10T00:00:00.000Z",
            "createdAt": "2026-03-18T09:00:00.000Z"
        }
    ]
}
```

---

### 2.2 Tạo hóa đơn phát sinh (Admin/Manager)

**Endpoint:** `POST /api/invoices/incurred`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
    "contractId": "...",
    "title": "Hóa đơn sửa chữa",
    "totalAmount": 500000,
    "type": "repair",
    "dueDate": "2026-04-10",
    "repairRequestId": "...",
    "images": ["url1", "url2"]
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "_id": "...",
        "invoiceCode": "INC-002",
        "status": "Draft"
    }
}
```

---

### 2.3 Phát hành hóa đơn phát sinh

**Endpoint:** `PUT /api/invoices/incurred/:id/release`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "message": "Phát hành hóa đơn thành công!",
    "data": {
        "_id": "...",
        "status": "Unpaid"
    }
}
```

---

### 2.4 Xem chi tiết hóa đơn phát sinh

**Endpoint:** `GET /api/invoices/incurred/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": {
        "_id": "...",
        "invoiceCode": "INC-001",
        "contractId": {
            "_id": "...",
            "contractCode": "HN/Phòng 101/2026/HDSV/123",
            "roomId": {
                "name": "Phòng 101"
            }
        },
        "title": "Hóa đơn sửa chữa",
        "totalAmount": 500000,
        "status": "Unpaid",
        "type": "repair",
        "dueDate": "2026-04-10T00:00:00.000Z",
        "images": ["url1", "url2"]
    }
}
```

---

### 2.5 Tenant xem chi tiết hóa đơn phát sinh

**Endpoint:** `GET /api/invoices/incurred/my/:id`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": {
        "_id": "...",
        "invoiceCode": "INC-001",
        "title": "Hóa đơn sửa chữa",
        "totalAmount": 500000,
        "status": "Unpaid",
        "type": "repair",
        "dueDate": "2026-04-10T00:00:00.000Z"
    }
}
```

---

### 2.6 Thanh toán hóa đơn phát sinh

**Endpoint:** `PUT /api/invoices/incurred/:id/pay`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "message": "Thanh toán hóa đơn phát sinh thành công.",
    "data": {
        "_id": "...",
        "invoiceCode": "INC-001",
        "status": "Paid"
    }
}
```

---

## 3. Thanh toán qua Sepay QR

### 3.1 Khởi tạo thanh toán

**Endpoint:** `POST /api/invoices/payment/:id/initiate`

**Headers:**
```
Authorization: Bearer <token>
```

**Body:**
```json
{
    "type": "periodic" // hoặc "incurred"
}
```

**Response:**
```json
{
    "success": true,
    "data": {
        "invoiceId": "...",
        "qrCode": "https://sepay.vn/qr/...",
        "transactionCode": "SEP-123456",
        "amount": 3175000,
        "status": "pending"
    }
}
```

---

### 3.2 Kiểm tra trạng thái thanh toán

**Endpoint:** `GET /api/invoices/payment/status/:transactionCode`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "data": {
        "transactionCode": "SEP-123456",
        "status": "Success",
        "amount": 3175000,
        "paymentDate": "2026-03-18T10:30:00.000Z"
    }
}
```

---

### 3.3 Hủy thanh toán đang chờ

**Endpoint:** `POST /api/invoices/payment/cancel/:transactionCode`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "success": true,
    "message": "Hủy thanh toán thành công"
}
```

---

## 4. Status hóa đơn

| Status | Mô tả |
|--------|--------|
| `Draft` | Hóa đơn nháp, chưa phát hành |
| `Unpaid` | Chưa thanh toán |
| `Paid` | Đã thanh toán |

---

## 5. Type hóa đơn phát sinh

| Type | Mô tả |
|------|--------|
| `repair` | Hóa đơn sửa chữa |
| `violation` | Hóa đơn phạt vi phạm |

---

## 6. Lưu ý

- **Periodic Invoice:** Sử dụng model `InvoicePeriodic` (collection: `invoice_periodics`)
- **Incurred Invoice:** Sử dụng model `InvoiceIncurred` (collection: `invoices_incurred`)
- **Cả 2 đều có field `contractId`** để xác định chính xác người phải trả tiền
