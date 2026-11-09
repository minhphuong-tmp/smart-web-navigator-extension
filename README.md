# Smart Web & Forum Navigator 🚀

> **Chrome Extension:** Điều hướng thông minh trên Diễn đàn, Google Search và YouTube. Hỗ trợ phím tắt, mở tab chạy ngầm, copy nhanh link video YouTube kèm đánh dấu **✓ Đã xem** và tự động đồng bộ vào Lịch sử xem (Watch History).

---

## 🌟 Tính Năng Nổi Bật

### 1. 📺 Tối Ưu Hóa Trải Nghiệm YouTube
- **Nút Copy Link Siêu Tốc:** Nút bấm nhỏ gọn, tinh tế gắn trực tiếp vào từng thumbnail video trên Trang chủ, Tìm kiếm, Kênh và Cột đề xuất bên phải.
- **Đánh Dấu "✓ Đã Xem" Vĩnh Viễn:** Khi bấm copy, video lập tức được lưu vào bộ nhớ cục bộ (`chrome.storage.local`) và hiển thị dấu tích xanh `✓ Đã xem`. F5 hoặc khởi động lại trình duyệt vẫn ghi nhớ.
- **Tự Động Báo YouTube Đã Xem:** Tự động gửi phản hồi *"Tôi đã xem video này rồi"* tới thuật toán YouTube để loại bỏ video khỏi bảng tin và đề xuất các clip mới thay thế ngay lập tức.
- **Phím Tắt [c]:** Bấm phím `c` trên bàn phím để copy link video đang chọn ngay tức thì.

### 2. 📱 Copy Link Clip & Reel Trên Facebook (Dùng Cho AI Xem Video)
- **Nút "Copy clip" Gắn Trên Mọi Video:** Tự động phát hiện video, Reels, video trong bài viết Feed, nhóm hoặc trang Facebook và hiển thị nút copy nhỏ gọn ở góc trên clip.
- **Chuẩn Hóa Link Tự Động:** Loại bỏ toàn bộ các tham số tracking rác của Facebook (`fbclid`, `mibextid`, `__tn__`...) để trả về link video chuẩn xác nhất (`facebook.com/reel/ID` hoặc `facebook.com/watch/?v=ID`).
- **Tương Thích Tuyệt Đối Với `skill xem video`:** Chỉ cần bấm nút copy trên Facebook, bạn có thể gửi ngay vào chat AI để bóc băng, tóm tắt hoặc xem nội dung video.
- *(Lưu ý: Clip Facebook không gắn dấu tích đã xem, chỉ hỗ trợ copy link nhanh).*

### 3. 💬 Diễn Đàn (Voz, Tinh tế, Reddit, XenForo, v.v.)
- **Phím [Tab] / [Shift + Tab]:** Nhảy nhanh qua từng bài viết hoặc bình luận kế tiếp.
- **Phím [Enter]:** Mở bài viết / link trong **Tab mới chạy ngầm (active = false)**, không làm gián đoạn trang đang đọc.
- **Phím [Shift + Mũi tên Phải/Trái]:** Chuyển trang tiếp theo / trang trước liền mạch.

### 3. 🔍 Google Search
- Điều hướng các kết quả tìm kiếm bằng bàn phím tiện lợi, mở kết quả trong tab ngầm.

---

## 🛠️ Hướng Dẫn Cài Đặt Trên Máy Khác

1. **Tải mã nguồn:**
   - Clone repository này về máy:
     ```bash
     git clone https://github.com/minhphuong-tmp/smart-web-navigator-extension.git
     ```
   - Hoặc tải file ZIP từ nút **Code ➔ Download ZIP** rồi giải nén ra một thư mục.

2. **Cài đặt vào Google Chrome / Cốc Cốc / Edge / Brave:**
   - Mở trình duyệt và truy cập vào địa chỉ: `chrome://extensions/`
   - Bật công tắc **Developer mode (Chế độ cho nhà phát triển)** ở góc trên bên phải.
   - Bấm vào nút **Load unpacked (Tải tiện ích đã giải nén)** ở góc trên bên trái.
   - Chọn thư mục mã nguồn vừa tải về.
   - Tiện ích sẽ xuất hiện ngay lập tức với phiên bản mới nhất!

---

## 📁 Cấu Trúc Thư Mục

```text
├── manifest.json       # Cấu hình Chrome Extension (Manifest V3)
├── background.js       # Service worker xử lý mở tab ngầm & ghi nhận lịch sử xem YouTube
├── content.js          # Logic điều hướng phím tắt, nút copy & đồng bộ giao diện
├── styles.css          # Giao diện nút bấm, tích xanh & thanh hiển thị
├── icons/              # Bộ icon 16x16, 48x48, 128x128
└── README.md           # Tài liệu hướng dẫn sử dụng
```

---

## 📝 Giấy Phép
Dự án được phát triển và sử dụng cho mục đích cá nhân & cộng đồng.
