# 📢 API Thông Báo (Notification System) - Tài liệu cho Frontend

## 📋 Tổng Quan

Hệ thống thông báo với workflow đơn giản:
- **Owner**: Tạo thông báo nháp → Chỉnh sửa → Phát hành cho Manager + Accountant
- **Manager/Accountant**: Nhận và đọc thông báo từ Owner
- **Hệ thống**: Gửi thông báo tự động (thanh toán, hợp đồng, bảo trì) - *sẽ triển khai sau*

## 🔐 Base URL & Authentication

```
Base URL: /api/notifications
Authentication: Bearer Token (required cho tất cả endpoints)
```

## 📊 Data Models

### Notification Object
```typescript
interface Notification {
    _id: string;
    title: string;                    // Max 200 ký tự
    content: string;                  // Max 1000 ký tự
    type: 'staff' | 'system' | 'tenant'; // staff: owner->manager, tenant: manager->tenant
    status: 'draft' | 'sent' | 'archived';
    created_by: string;               // ObjectId của người tạo
    recipients: Array<{               // Chỉ có khi status = 'sent'
        recipient_id: string;
        recipient_role: 'manager' | 'accountant' | 'tenant';
        is_read: boolean;
        read_at: Date | null;
    }>;
    createdAt: Date;
    updatedAt: Date;
}
```

### Response Format
```typescript
interface ApiResponse<T> {
    success: boolean;
    message: string;
    data?: T;
}
```

## 👥 Phân Quyền

| Role | Tạo thông báo nháp | Sửa/Xóa nháp | Phát hành | Nhận thông báo | Đánh dấu đã đọc |
|------|:------------------:|:-------------:|:---------:|:--------------:|:---------------:|
| **Owner** | ✅ (gửi Staff) | ✅ | ✅ | ✅ (do mình tạo) | ❌ |
| **Manager** | ✅ (gửi Tenant)| ✅ | ✅ | ✅ (từ Owner) | ✅ |
| **Accountant** | ❌ | ❌ | ❌ | ✅ (từ Owner) | ✅ |
| **Tenant** | ❌ | ❌ | ❌ | ✅ (từ Manager) | ✅ |

## 🚀 API Endpoints

### 1. 📝 [Owner/Manager] Tạo thông báo nháp

**POST** `/draft`

```typescript
// Request Body
{
    title: string;              // Bắt buộc, max 200 ký tự
    content: string;            // Bắt buộc, max 1000 ký tự
}

// Response 201 - Success
{
    success: true,
    message: "Tạo thông báo nháp thành công",
    data: {
        _id: "notification_id",
        title: "Thông báo họp định kỳ",
        content: "Thông báo về cuộc họp định kỳ tháng 3...",
        type: "staff",
        status: "draft",
        created_by: "owner_id",
        recipients: [],
        createdAt: "2026-03-16T10:30:00.000Z",
        updatedAt: "2026-03-16T10:30:00.000Z"
    }
}
```

### 2. ✏️ [Owner/Manager] Sửa thông báo nháp

**PUT** `/draft/:notificationId`

```typescript
// Request Body (same as create)
{
    title: string;
    content: string;
}

// Response 200 - Success
{
    success: true,
    message: "Cập nhật thông báo nháp thành công",
    data: {
        _id: "notification_id",
        title: "Thông báo họp định kỳ (đã sửa)",
        content: "Nội dung đã được cập nhật...",
        type: "staff",
        status: "draft",
        created_by: "owner_id",
        recipients: [],
        updatedAt: "2026-03-16T11:00:00.000Z"
    }
}
```

### 3. 🗑️ [Owner/Manager] Xóa thông báo nháp

**DELETE** `/draft/:notificationId`

```typescript
// No Request Body required

// Response 200 - Success
{
    success: true,
    message: "Đã xóa thông báo nháp thành công"
}
```

### 4. 🚀 [Owner/Manager] Phát hành thông báo

**POST** `/draft/:notificationId/publish`

**Chú ý**: Sau khi phát hành, thông báo chuyển thành trạng thái `sent` và không thể sửa/xóa nữa.

```typescript
// No Request Body required

// Response 200 - Success
{
    success: true,
    message: "Phát hành thông báo thành công",
    data: {
        _id: "notification_id",
        title: "Thông báo họp định kỳ",
        content: "Thông báo về cuộc họp...",
        type: "staff",
        status: "sent",                    // Đã chuyển thành 'sent'
        created_by: "owner_id",
        recipients: [                      // Đã tạo recipients
            {
                recipient_id: "manager_id",
                recipient_role: "manager",
                is_read: false,
                read_at: null
            },
            {
                recipient_id: "accountant_id",
                recipient_role: "accountant",
                is_read: false,
                read_at: null
            }
        ],
        updatedAt: "2026-03-16T11:30:00.000Z"
    }
}
```

### 5. 📄 [Owner/Manager] Lấy danh sách thông báo nháp

**GET** `/my-drafts`

```typescript
// Query Parameters
{
    page?: number;              // Default: 1
    limit?: number;             // Default: 20, max: 100
}

// Response 200 - Success
{
    success: true,
    message: "Lấy danh sách thông báo nháp thành công",
    data: {
        notifications: [
            {
                _id: "draft_1",
                title: "Thông báo nháp 1",
                content: "Nội dung nháp...",
                createdAt: "2026-03-16T10:00:00.000Z",
                updatedAt: "2026-03-16T10:15:00.000Z"
            }
        ],
        pagination: {
            current_page: 1,
            total_pages: 2,
            total_count: 25,
            limit: 20
        }
    }
}
```

### 6. 📋 Lấy danh sách thông báo theo role

**GET** `/my-notifications`

```typescript
// Query Parameters
{
    page?: number;              // Default: 1
    limit?: number;             // Default: 20, max: 100
    is_read?: 'true' | 'false'; // Filter theo trạng thái đã đọc (chỉ người nhận)
    status?: 'draft' | 'sent' | 'archived'; // Filter theo trạng thái (chỉ người gửi)
    outbound?: 'true' | 'false'; // (CHỈ DÀNH CHO MANAGER): truyền outbound=true để xem danh sách thông báo Manager đã gửi đi (draft + sent)
}

// Response cho Owner (hoặc Manager gọi với outbound=true) - xem tất cả thông báo do mình tạo (draft + sent)
// Nếu truyền ?status=draft → chỉ lấy nháp
// Nếu truyền ?status=sent  → chỉ lấy đã gửi
// Không truyền status       → lấy tất cả
{
    success: true,
    message: "Lấy danh sách thông báo thành công",
    data: {
        notifications: [
            {
                _id: "notification_id_1",
                title: "Thông báo đã gửi",
                content: "Nội dung thông báo...",
                type: "staff",
                status: "sent",
                createdAt: "2026-03-16T09:00:00.000Z",
                updatedAt: "2026-03-16T09:30:00.000Z"
            },
            {
                _id: "notification_id_2",
                title: "Thông báo nháp",
                content: "Nội dung chưa gửi...",
                type: "staff",
                status: "draft",
                createdAt: "2026-03-16T10:00:00.000Z",
                updatedAt: "2026-03-16T10:00:00.000Z"
            }
        ],
        summary: {
            draft_count: 3,    // Tổng số thông báo nháp (dùng để hiển thị badge)
            sent_count: 10     // Tổng số thông báo đã gửi
        },
        pagination: {
            current_page: 1,
            total_pages: 2,
            total_count: 13,
            limit: 20
        }
    }
}

// Response cho Người Nhận (Manager/Accountant/Tenant) - xem thông báo nhận được từ người khác (gọi KHÔNG CÓ outbound=true)
{
    success: true,
    message: "Lấy danh sách thông báo thành công",
    data: {
        notifications: [
            {
                _id: "notification_id",
                title: "Thông báo từ Owner",
                content: "Nội dung thông báo...",
                type: "staff",
                status: "sent",
                createdAt: "2026-03-16T09:00:00.000Z",
                is_read: false,                   // Trạng thái đã đọc của user này
                read_at: null
            }
        ],
        pagination: { /* ... */ }
    }
}
```

### 7. ✅ [Người Nhận] Đánh dấu đã đọc

**PATCH** `/:notificationId/read`

```typescript
// No Request Body required

// Response 200 - Success
{
    success: true,
    message: "Đánh dấu đã đọc thành công",
    data: {
        _id: "notification_id",
        title: "Thông báo từ Owner",
        // ... other fields
        is_read: true,
        read_at: "2026-03-16T12:00:00.000Z"
    }
}
```

### 8. ✅ [Người Nhận] Đánh dấu tất cả đã đọc

**PATCH** `/mark-all-read`

```typescript
// No Request Body required

// Response 200 - Success
{
    success: true,
    message: "Đã đánh dấu tất cả thông báo là đã đọc"
}
```

### 9. 🔢 Lấy số thông báo chưa đọc

**GET** `/unread-count`

```typescript
// No Request Body required

// Response 200 - Success
{
    success: true,
    message: "Lấy số thông báo chưa đọc thành công",
    data: {
        unread_count: 3    // Manager/Accountant: số thông báo chưa đọc, Owner: 0
    }
}
```

## ⚠️ Error Responses

### 400 Bad Request - Validation Error
```typescript
{
    success: false,
    message: "Tiêu đề thông báo không được để trống"
}
```

### 401 Unauthorized
```typescript
{
    success: false,
    message: "Token không hợp lệ"
}
```

### 403 Forbidden - Insufficient Permissions
```typescript
{
    success: false,
    message: "Chỉ Owner mới có quyền tạo thông báo"
}
```

### 404 Not Found
```typescript
{
    success: false,
    message: "Không tìm thấy thông báo nháp hoặc bạn không có quyền chỉnh sửa"
}
```

### 500 Internal Server Error
```typescript
{
    success: false,
    message: "Lỗi hệ thống"
}
```

## 📝 Validation Rules

### Title (Tiêu đề)
- **Bắt buộc**: Có
- **Độ dài**: 1-200 ký tự
- **Kiểu**: String, không được chỉ có khoảng trắng

### Content (Nội dung)
- **Bắt buộc**: Có
- **Độ dài**: 1-1000 ký tự
- **Kiểu**: String, không được chỉ có khoảng trắng

### Pagination
- **page**: Số nguyên dương (≥1)
- **limit**: Số nguyên từ 1-100
- **is_read**: 'true' hoặc 'false'
- **status**: 'draft', 'sent', 'archived'


