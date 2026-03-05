# Hướng dẫn cài đặt Ngrok & Sepay Webhook

> Tài liệu hướng dẫn cấu hình ngrok để chạy tính năng thanh toán qua cổng Sepay trên môi trường development.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Cài đặt Ngrok](#2-cài-đặt-ngrok)
3. [Chạy Ngrok](#3-chạy-ngrok)
4. [Cấu hình Sepay Webhook](#4-cấu-hình-sepay-webhook)
5. [Cấu hình file .env](#5-cấu-hình-file-env)
6. [Kiểm tra kết nối](#6-kiểm-tra-kết-nối)
7. [Lưu ý quan trọng](#7-lưu-ý-quan-trọng)
8. [Xử lý lỗi thường gặp](#8-xử-lý-lỗi-thường-gặp)

---

## 1. Tổng quan

### Tại sao cần Ngrok?

```
┌──────────┐     ┌──────────┐     ┌──────────────┐     ┌──────────┐
│  Khách   │────>│  Sepay   │────>│    Ngrok      │────>│ Backend  │
│  hàng    │     │  Server  │     │  (Tunnel)     │     │ Server   │
│ chuyển   │     │ detect   │     │               │     │ localhost│
│ tiền     │     │ giao dịch│     │ https://xxx   │     │ :9999    │
│          │     │ → webhook│     │ .ngrok-free   │     │          │
└──────────┘     └──────────┘     │ .app          │     └──────────┘
                                  └──────────────┘
```

- **Sepay** cần gọi webhook đến server của bạn khi có giao dịch
- Server chạy trên `localhost:9999` → Sepay **KHÔNG** gọi được
- **Ngrok** tạo tunnel public URL → Sepay gọi được đến server local

### Luồng thanh toán

```
1. User quét QR → Chuyển tiền vào tài khoản ngân hàng
2. Sepay phát hiện giao dịch mới
3. Sepay gọi webhook đến URL ngrok
4. Ngrok forward request đến localhost:9999
5. Backend xử lý → Cập nhật trạng thái thanh toán
6. Frontend polling → Hiển thị "Thanh toán thành công"
```

---

## 2. Cài đặt Ngrok

### Bước 1: Tải Ngrok

**Cách 1: Tải trực tiếp**
- Vào [https://ngrok.com/download](https://ngrok.com/download)
- Chọn **Windows** → Tải file zip
- Giải nén vào thư mục bất kỳ (VD: `C:\ngrok`)

**Cách 2: Dùng npm**
```powershell
npm install -g ngrok
```

**Cách 3: Dùng Chocolatey**
```powershell
choco install ngrok
```

### Bước 2: Đăng ký tài khoản Ngrok (miễn phí)

1. Vào [https://dashboard.ngrok.com/signup](https://dashboard.ngrok.com/signup)
2. Đăng ký tài khoản (có thể dùng Google/GitHub)
3. Sau khi đăng nhập, vào **Your Authtoken**
4. Copy authtoken

### Bước 3: Cấu hình Authtoken

```powershell
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

**Ví dụ:**
```powershell
ngrok config add-authtoken 2abc123def456ghi789jkl_EXAMPLE
```

> ✅ Chỉ cần làm 1 lần. Token sẽ được lưu tại `C:\Users\<username>\AppData\Local\ngrok\ngrok.yml`

---

## 3. Chạy Ngrok

### Bước 1: Đảm bảo Backend đang chạy

```powershell
# Terminal 1 - Chạy server backend
cd d:\Semester_9\BE_HoangNam\Backend_HNALMS
npm start
```

Đảm bảo thấy log:
```
🚀 Server running on port 9999
📝 API : http://localhost:9999/api
✅ MongoDB connected successfully
✅ Email service is ready
[CRON] 🕐 Deposit expiration job started (interval: 1 minute)
```

### Bước 2: Mở terminal MỚI và chạy Ngrok

```powershell
# Terminal 2 - Chạy ngrok (KHÔNG đóng terminal backend)
ngrok http 9999
```

### Bước 3: Ghi lại URL

Sau khi chạy, ngrok sẽ hiển thị:

```
Session Status                online
Account                       your-email@gmail.com (Plan: Free)
Version                       3.x.x
Region                        Asia Pacific (ap)
Forwarding                    https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app -> http://localhost:9999
```

> 📋 **Copy URL** `https://xxxx-xx-xxx-xxx-xxx.ngrok-free.app` — đây là URL public của bạn

### Script chạy nhanh (tuỳ chọn)

Tạo file `start-ngrok.bat` tại thư mục gốc:

```batch
@echo off
echo ============================================
echo  Starting Ngrok Tunnel for HNALMS Backend
echo  Port: 9999
echo ============================================
echo.
echo [!] Dam bao Backend dang chay o port 9999
echo [!] Sau khi chay, copy URL ngrok va cap nhat tren Sepay
echo.
ngrok http 9999
```

Double-click file này để chạy nhanh.

---

## 4. Cấu hình Sepay Webhook

### Bước 1: Đăng nhập Sepay

Vào [https://my.sepay.vn](https://my.sepay.vn) → Đăng nhập

### Bước 2: Vào cấu hình Webhook

Menu bên trái → **Tích hợp & Thông báo** → **Tích hợp WebHooks**

### Bước 3: Thêm hoặc Sửa Webhook

Click **"+ Thêm webhooks"** hoặc **"Sửa"** webhook đã có.

### Bước 4: Điền thông tin

| Mục | Giá trị | Ghi chú |
|-----|---------|---------|
| **Đặt tên** | `HNALMS Payment` | Tên bất kỳ |
| **Bắn WebHooks khi** | `Cả hai` | Nhận cả tiền vào và tiền ra |
| **Khi tài khoản ngân hàng là** | `BIDV - 4270992356` | Chọn tài khoản đã liên kết |
| **Lọc theo tài khoản ảo** | ☐ **BỎ TICK** | ⚠️ Quan trọng! |
| **Bỏ qua nếu không có Code thanh toán** | **Không** | ⚠️ Quan trọng! |
| **Gọi đến URL** | `https://xxxx.ngrok-free.app/api/deposits/webhook/sepay` | URL ngrok + path |
| **Là WebHooks xác thực thanh toán?** | `Đúng` | |
| **Kiểu chứng thực** | `API Key` | |
| **Request Content type** | `application/json` | |
| **API Key** | `HNALMS_SEPAY_2026_SECRET` | Phải khớp với file .env |
| **Trạng thái** | `Kích hoạt` | |

### ⚠️ Lưu ý cực kỳ quan trọng

```
❌ SAI:  ☐ "Lọc theo tài khoản ảo" = TICK
✅ ĐÚNG: ☐ "Lọc theo tài khoản ảo" = BỎ TICK

❌ SAI:  "Bỏ qua nếu không có Code thanh toán?" = "Có"
✅ ĐÚNG: "Bỏ qua nếu không có Code thanh toán?" = "Không"
```

> Nếu cấu hình sai 2 mục trên, Sepay sẽ **KHÔNG** gọi webhook dù đã chuyển tiền thành công.

### Bước 5: Lưu cấu hình

Click **"Cập nhật"** hoặc **"Thêm"**

---

## 5. Cấu hình file .env

```env
# ==========================================
# SEPAY PAYMENT GATEWAY
# ==========================================
SEPAY_WEBHOOK_TOKEN=HNALMS_SEPAY_2026_SECRET
BANK_BIN=970418
BANK_ACCOUNT=4270992356
BANK_ACCOUNT_NAME=PHAM QUANG DUY
```

### Giải thích các biến

| Biến | Giá trị | Mô tả |
|------|---------|-------|
| `SEPAY_WEBHOOK_TOKEN` | `HNALMS_SEPAY_2026_SECRET` | API Key xác thực webhook (phải khớp với Sepay) |
| `BANK_BIN` | `970418` | Mã BIN ngân hàng BIDV (dùng cho VietQR) |
| `BANK_ACCOUNT` | `4270992356` | Số tài khoản ngân hàng nhận tiền |
| `BANK_ACCOUNT_NAME` | `PHAM QUANG DUY` | Tên chủ tài khoản |

### Bảng mã BIN ngân hàng phổ biến

| Ngân hàng | BIN |
|-----------|-----|
| BIDV | `970418` |
| Vietcombank | `970436` |
| Techcombank | `970407` |
| MB Bank | `970422` |
| VPBank | `970432` |
| ACB | `970416` |
| TPBank | `970423` |
| Sacombank | `970403` |

---

## 6. Kiểm tra kết nối

### Test 1: Kiểm tra ngrok hoạt động

Mở trình duyệt, truy cập:
```
https://xxxx.ngrok-free.app/api/health
```

**Kết quả mong đợi:**
```json
{
  "status": "ok"
}
```

### Test 2: Kiểm tra webhook endpoint

Mở PowerShell:

```powershell
# Test webhook đặt cọc
$body = @{
    id = 99999
    transferAmount = 2700000
    content = "Coc P310 05032026"
    transferType = "in"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "https://xxxx.ngrok-free.app/api/deposits/webhook/sepay" `
    -Method POST `
    -Headers @{
        "Authorization" = "Apikey HNALMS_SEPAY_2026_SECRET"
        "Content-Type" = "application/json"
    } `
    -Body $body
```

### Test 3: Kiểm tra webhook hóa đơn phát sinh

```powershell
# Test webhook hóa đơn
$body = @{
    id = 99999
    transferAmount = 500000
    content = "HD INV320 05032026"
    transferType = "in"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "https://xxxx.ngrok-free.app/api/invoices/webhook/sepay" `
    -Method POST `
    -Headers @{
        "Authorization" = "Apikey HNALMS_SEPAY_2026_SECRET"
        "Content-Type" = "application/json"
    } `
    -Body $body
```

### Test 4: Kiểm tra logs trên Sepay

1. Vào **my.sepay.vn** → **Tích hợp WebHooks**
2. Click vào webhook → Xem **"Thống kê gửi"**
3. Hoặc vào **WebHooks Logs** ở menu bên trái

---

## 7. Lưu ý quan trọng

### ⚠️ URL ngrok thay đổi mỗi lần restart

```
Lần 1: https://1c1d-42-113-240-238.ngrok-free.app
Lần 2: https://36cd-42-113-240-238.ngrok-free.app  ← URL MỚI!
Lần 3: https://a1b2-42-113-240-238.ngrok-free.app  ← URL MỚI!
```

**Mỗi lần restart ngrok → Phải cập nhật lại URL trên Sepay dashboard!**

> 💡 **Mẹo:** Dùng gói ngrok trả phí để có **Fixed subdomain** (URL cố định), không cần cập nhật lại.

### ⚠️ Không đóng terminal ngrok

```
Terminal 1: npm start        ← KHÔNG ĐÓNG
Terminal 2: ngrok http 9999  ← KHÔNG ĐÓNG
```

Nếu đóng terminal ngrok → Sepay không gọi được webhook → Thanh toán không được xác nhận.

### ⚠️ Chỉ 1 session ngrok (gói miễn phí)

Gói free chỉ cho **1 tunnel** cùng lúc. Nếu chạy ngrok ở terminal khác:

```powershell
# Tắt session cũ trước
ngrok http 9999 --region ap
# Nếu báo lỗi "tunnel session limit", chạy:
taskkill /f /im ngrok.exe
ngrok http 9999
```

### ⚠️ Webhook phục vụ 2 chức năng

Hệ thống có **2 webhook endpoint**:

| Chức năng | Webhook URL |
|-----------|-------------|
| Thanh toán **đặt cọc** | `https://xxxx.ngrok-free.app/api/deposits/webhook/sepay` |
| Thanh toán **hóa đơn phát sinh** | `https://xxxx.ngrok-free.app/api/invoices/webhook/sepay` |

> Trên Sepay, bạn cần tạo **2 webhook** riêng biệt, hoặc dùng **1 webhook chung** và backend tự phân biệt qua nội dung chuyển khoản (`Coc ...` vs `HD ...`).

---

## 8. Xử lý lỗi thường gặp

### Lỗi 1: "ERR_NGROK_108 — tunnel session limit"

```
Nguyên nhân: Đã có 1 session ngrok đang chạy
```

**Cách fix:**
```powershell
taskkill /f /im ngrok.exe
ngrok http 9999
```

### Lỗi 2: Sepay không gọi webhook (Hook 0)

```
Nguyên nhân: Cấu hình webhook sai
```

**Checklist kiểm tra:**
- [ ] URL webhook đúng (khớp với ngrok URL hiện tại)
- [ ] "Lọc theo tài khoản ảo" = **BỎ TICK**
- [ ] "Bỏ qua nếu không có Code thanh toán" = **Không**
- [ ] Trạng thái webhook = **Kích hoạt**
- [ ] Ngrok đang chạy (terminal không đóng)

### Lỗi 3: Webhook trả về 401 Unauthorized

```
Nguyên nhân: API Key không khớp
```

**Cách fix:**
- Kiểm tra API Key trên Sepay = giá trị `SEPAY_WEBHOOK_TOKEN` trong `.env`
- Sepay gửi header: `"Authorization": "Apikey HNALMS_SEPAY_2026_SECRET"`
- Backend verify: `Apikey ${process.env.SEPAY_WEBHOOK_TOKEN}`

### Lỗi 4: Webhook trả về "Deposit not found"

```
Nguyên nhân: Deposit đã hết hạn (5 phút) hoặc đã bị xóa
```

**Cách fix:**
- Tạo deposit mới từ Frontend
- Chuyển tiền trong vòng 5 phút
- Đảm bảo nội dung chuyển khoản khớp với transactionCode

### Lỗi 5: Ngrok URL không truy cập được

```
Nguyên nhân: Ngrok chưa chạy hoặc đã tắt
```

**Cách fix:**
```powershell
# Kiểm tra ngrok đang chạy
tasklist | findstr ngrok

# Nếu không có → khởi động lại
ngrok http 9999
```

---

## Quy trình khởi động hàng ngày

```powershell
# ============================================
# BƯỚC 1: Mở Terminal 1 → Chạy Backend
# ============================================
cd d:\Semester_9\BE_HoangNam\Backend_HNALMS
npm start

# ============================================
# BƯỚC 2: Mở Terminal 2 → Chạy Ngrok
# ============================================
ngrok http 9999

# ============================================
# BƯỚC 3: Copy URL ngrok mới
# ============================================
# VD: https://xxxx.ngrok-free.app

# ============================================
# BƯỚC 4: Cập nhật URL trên Sepay (nếu thay đổi)
# ============================================
# my.sepay.vn → Webhooks → Sửa → Đổi URL → Cập nhật
```

---

## Tài liệu liên quan

- [Deposit API Documentation](./deposit-api.md) — API đặt cọc phòng
- [Invoice Payment API Documentation](./invoice-payment-api.md) — API thanh toán hóa đơn phát sinh
- [Sepay Official Docs](https://docs.sepay.vn) — Tài liệu chính thức Sepay
- [Ngrok Official Docs](https://ngrok.com/docs) — Tài liệu chính thức Ngrok
- [VietQR API](https://www.vietqr.io/) — Tạo mã QR thanh toán