# Hệ thống gửi thông báo gia hạn hợp đồng

## Mô tả

Hệ thống tự động gửi thông báo nhắc nhở Tenant về việc hợp đồng thuê phòng sắp hết hạn tại các mốc thời gian:
- **Trước 1 tháng** (30 ngày)
- **Trước 2 tuần** (14 ngày)
- **Trước 1 tuần** (7 ngày)

---

## Luồng hoạt động

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CRON JOB (Mỗi ngày 9:00)                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. Query các contract đang active có endDate trong vòng 30 ngày tới     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. Với mỗi contract:                                                       │
│     - Tính targetDate = endDate - (30/14/7 days)                          │
│     - Nếu hôm nay >= targetDate → tiến hành gửi notification             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. Kiểm tra log đã gửi chưa (contractId + reminderType)                  │
│     - Nếu đã gửi → bỏ qua                                                 │
│     - Nếu chưa gửi → tạo notification mới                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. Tạo notification:                                                      │
│     - type: "system"                                                        │
│     - recipients: tenant của contract                                       │
│     - Lưu log vào contract_notification_logs                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Models

### 1. ContractNotificationLog
Lưu trữ log các notification đã gửi để tránh gửi trùng.

```javascript
{
    contractId: ObjectId,        // ID của contract
    tenantId: ObjectId,         // ID của tenant
    notificationId: ObjectId,    // ID của notification đã gửi
    reminderType: String,        // "1_month" | "2_weeks" | "1_week"
    sentAt: Date,               // Thời điểm gửi
    createdAt: Date,
    updatedAt: Date
}
// Index: { contractId: 1, reminderType: 1 } (unique)
```

---

## API cho Frontend

### 1. Lấy danh sách thông báo của Tenant

**Endpoint:** `GET /api/notifications`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | Number | Số trang (default: 1) |
| `limit` | Number | Số lượng mỗi trang (default: 20) |
| `type` | String | Lọc theo loại: `staff`, `system`, `tenant` |

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "notifications": [
        {
            "_id": "...",
            "title": "Thông báo gia hạn hợp đồng - 1 tháng",
            "content": "Hợp đồng thuê phòng HN/Phòng 308/2026/HDSV/336 sẽ hết hạn sau 30 ngày (17/03/2027). Vui lòng liên hệ Manager để gia hạn.",
            "type": "system",
            "status": "sent",
            "createdAt": "2026-03-18T09:00:00.000Z"
        }
    ],
    "pagination": {
        "current_page": 1,
        "total_pages": 1,
        "total_count": 1,
        "limit": 20
    }
}
```

---

### 2. Đánh dấu thông báo đã đọc

**Endpoint:** `PUT /api/notifications/:id/read`

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
    "_id": "...",
    "title": "Thông báo gia hạn hợp đồng - 1 tháng",
    "content": "...",
    "type": "system",
    "status": "sent",
    "recipients": [
        {
            "recipient_id": "...",
            "recipient_role": "tenant",
            "is_read": true,
            "read_at": "2026-03-18T10:30:00.000Z"
        }
    ]
}
```

---

### 3. Test thủ công - Gửi notification gia hạn (Dev only)

**Endpoint:** `POST /api/contracts/renewal/send-notifications`

**Description:** Trigger thủ công để gửi notification (dùng cho dev/test)

**Response:**
```json
{
    "success": true,
    "message": "Đã gửi 3 notification, bỏ qua 0 notification đã gửi trước đó",
    "sentCount": 3,
    "skippedCount": 0
}
```

---

## Thông báo mẫu

### 1 tháng trước
```
Title: Thông báo gia hạn hợp đồng - Phòng 308
Content: Hợp đồng thuê phòng HN/Phòng 308/2026/HDSV/336 sẽ hết hạn sau 30 ngày (17/03/2027). Vui lòng liên hệ Quản Lý để gia hạn hoặc truy cập vào mục Gia Hạn Hợp Đồng trên ứng dụng. Xin Cảm Ơn !
```

### 2 tuần trước
```
Title: Thông báo gia hạn hợp đồng - Phòng 308
Content: Hợp đồng thuê phòng HN/Phòng 308/2026/HDSV/336 sẽ hết hạn sau 14 ngày (17/03/2027). Vui lòng liên hệ Quản Lý để gia hạn hoặc truy cập vào mục Gia Hạn Hợp Đồng trên ứng dụng. Xin Cảm Ơn !
```

### 1 tuần trước
```
Title: Thông báo gia hạn hợp đồng - Phòng 308
Content: Hợp đồng thuê phòng HN/Phòng 308/2026/HDSV/336 sẽ hết hạn sau 7 ngày (17/03/2027). Vui lòng liên hệ Quản Lý để gia hạn hoặc truy cập vào mục Gia Hạn Hợp Đồng trên ứng dụng. Xin Cảm Ơn !
```

---

## Xử lý các trường hợp đặc biệt

| Trường hợp | Xử lý |
|-------------|-------|
| 1 Tenant có 2 Contract | Mỗi contract gửi notification riêng dựa trên endDate của contract đó |
| Server miss cron job | Job chạy ngày tiếp theo sẽ gửi notification nếu hôm nay >= targetDate |
| Contract bị terminated | Không gửi notification (chỉ gửi cho contract status = "active") |

---

## Cấu hình

- **Cron Job:** Chạy mỗi 1 phút (TEST MODE) - Đổi thành `0 9 * * *` khi deploy production
- **Thời gian check trước:** 30 ngày (có thể thay đổi trong code)

---

## Files

| File | Mục đích |
|------|-----------|
| `src/modules/contract-management/models/contract-notification-log.model.js` | Model lưu log notification |
| `src/modules/contract-management/services/contract-renewal.service.js` | Logic check & gửi notification |
| `src/modules/contract-management/jobs/contract-renewal.job.js` | Cron job |
| `src/modules/notification-management/models/notification.model.js` | Notification model |
