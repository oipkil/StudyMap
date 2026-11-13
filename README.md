# StudyMap — Nền Tảng Khám Phá Địa Điểm & Không Gian Học Cho Sinh Viên

Dự án **StudyMap (SSG - Student Study & Hangout Guide)** là nền tảng số hỗ trợ sinh viên ĐHQG-HCM và các trường đại học tìm kiếm, đánh giá và khám phá các quán café học bài, quán ăn ngon, thư viện và không gian làm việc nhóm xung quanh các cơ sở đại học.

---

## 👨‍💻 Vai Trò Đảm Nhận: Frontend (`apps/web`)

Trong dự án này, tôi đảm nhận toàn bộ phần **Frontend (`apps/web`)** — xây dựng giao diện người dùng, trải nghiệm tương tác (UI/UX) và kết nối API/Realtime với backend:

- **Công nghệ sử dụng**: React 19, TypeScript, Vite, Ant Design, MapLibre GL, Lucide Icons (`lucide-react`), Framer Motion, Axios, Socket.IO Client.
- **Khám phá & Bản đồ tương tác (`DiscoverPage`, `MapPage`, `MapLibreView`, `StudyOmnibox`)**:
  - Thanh tìm kiếm thông minh gợi ý theo khuôn viên đại học và nhu cầu học tập (24/7, ổ cắm, yên tĩnh, tiết kiệm, học nhóm).
  - Bộ lọc đa tiêu chí (khoảng cách, không gian, tiện ích, đánh giá, giá đồ uống) đồng bộ với bản đồ MapLibre GL và chế độ responsive mobile/desktop.
- **Chi tiết quán & So sánh (`PlaceDetailPage`, `ComparePage`)**:
  - Hiển thị thẻ chỉ số học tập (đánh giá sinh viên, giá đồ uống, tốc độ Wi-Fi, mật độ ổ cắm), chip tiện nghi học bài, thước đo không gian học tập, thư viện ảnh phân loại và bảng so sánh nhiều quán.
- **Tương tác cộng đồng & Hồ sơ cá nhân (`ReviewCard`, `WriteReviewModal`, `UserProfilePage`, `UserCollectionsPage`)**:
  - Luồng viết đánh giá nhanh, đăng bài cộng đồng, bình luận lồng nhau, bộ sưu tập quán yêu thích và thông báo thời gian thực.
- **Hộp chat Trợ lý AI (`FloatingChatWidget`)**:
  - Widget chat nổi hỗ trợ streaming phản hồi, gợi ý câu hỏi nhanh và hiển thị thẻ quán gợi ý trực tiếp.
- **Giao diện Quản trị (`pages/admin/*`)**:
  - Dashboard quản trị địa điểm, kiểm duyệt đóng góp, xử lý báo cáo, quản lý người dùng, sticker, trường động và cấu hình AI Provider.
- **Đồng bộ hệ thống Icon (`lucide-react`)**:
  - Chuyển đổi toàn bộ biểu tượng giao diện sang bộ vector icon Lucide đồng nhất, tối ưu độ rõ nét và thẩm mỹ trên cả desktop và mobile.

---

## 🏗️ Kiến Trúc Hệ Thống (Monorepo)

- **`packages/shared`**: Chứa Zod schema, types dùng chung, hằng số phân quyền, tiện ích mã hóa, xss sanitize, và Socket event contracts.
- **`apps/server`**: REST API & WebSocket Realtime Server (Express + Prisma ORM + PostgreSQL + Redis + Socket.IO + BullMQ).
- **`apps/web`**: Single Page Application (React 19 + TypeScript + Ant Design + Vite + MapLibre GL).
- **`prisma/`**: PostgreSQL Schema đa tầng với 30+ bảng quan hệ (RBAC, Revisions/Snapshots, Audit Logs, Outbox Pattern, Dynamic Custom Fields, Notifications, Announcements, Support Cases).

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Môi Trường Phát Triển

### 1. Yêu cầu tiên quyết
- **Node.js**: >= 20.x
- **pnpm**: >= 9.x hoặc 10.x
- **Docker Desktop** (hoặc PostgreSQL 16 + Redis 7 + Mailpit chạy cục bộ)

### 2. Khởi động hạ tầng Docker
```bash
docker compose up -d
```
Cổng dịch vụ:
- **PostgreSQL**: `localhost:5434` (Database: `ssg_db`, User: `ssg_user`, Pass: `ssg_password`)
- **Redis**: `localhost:6380`
- **Mailpit (SMTP Testing)**: `localhost:1025` (Web UI: `http://localhost:8025`)

### 3. Cài đặt Dependencies & Migration
```bash
# Cài đặt toàn bộ dependencies trong monorepo
pnpm install

# Sinh Prisma Client
pnpm prisma:generate

# Chạy Migration
pnpm prisma:migrate

# Gieo dữ liệu mẫu (Seed)
pnpm prisma:seed
```

Tài khoản mẫu sau khi seed:
- **Quản trị viên (Admin)**: `admin@ssg.edu.vn` / `Admin@123456`
- **Sinh viên 1 (User)**: `sinhvien1@hcmus.edu.vn` / `Student@123456`
- **Sinh viên 2 (User)**: `sinhvien2@hcmus.edu.vn` / `Student@123456`

---

## 💻 Lệnh Chạy Ứng Dụng

Mở 3 terminal riêng biệt để chạy các tiến trình độc lập:

### Terminal 1: Backend API & WebSocket Server
```bash
pnpm dev
# Server lắng nghe tại http://localhost:4000
```

### Terminal 2: Background Worker (Media & Outbox Queue)
```bash
pnpm dev:worker
# Xử lý BullMQ hàng đợi hình ảnh, biến thể sharp, và điều phối outbox
```

### Terminal 3: Frontend Web Application
```bash
pnpm dev:web
# Web UI chạy tại http://localhost:5173
```

---

## 🧪 Kiểm Thử & Kiểm Tra Kiểu (Typecheck & Tests)

```bash
# Kiểm tra TypeScript toàn bộ monorepo (shared, server, web)
pnpm typecheck

# Chạy toàn bộ 90 Automated Tests (Vitest across 7 test suites)
pnpm test

# Build production bundle cho cả 3 packages
pnpm build
```

---

## 🤖 Nền Tảng AI Đa Nhà Cung Cấp & Trợ Lý Học Tập (Phase 7)

Nền tảng SSG tích hợp hệ thống Trợ lý AI đa nhà cung cấp (OpenAI, Anthropic, Google Gemini, Ollama/OpenAI-compatible) với kiến trúc bảo mật và độ tin cậy cao:

### 1. Quản Trị Provider & Model trong Admin Dashboard
1. Đăng nhập bằng tài khoản Quản trị viên (`admin@ssg.edu.vn`) và truy cập `/admin/ai`.
2. Tại tab **"Nhà Cung Cấp AI & Models"**, bấm **"+ Thêm Nhà Cung Cấp"**.
3. Điền cấu hình: Adapter Type, Base URL, API Key, thiết lập Provider mặc định / fallback, thêm danh sách Model configs.
4. Bấm **"Kiểm Tra Kết Nối"** để kiểm thử endpoint (tự động chạy qua SSRF Guard bảo vệ hạ tầng nội bộ).

### 2. An Toàn & Bảo Mật Khóa API
- **Mã hóa khóa API tại rest**: Toàn bộ API Key được mã hóa AES-256-GCM bằng `ENCRYPTION_MASTER_KEY` trước khi lưu vào DB.
- **Che dấu khóa (Key Masking)**: Admin API chỉ trả khóa ở dạng che `sk-****abcd`, không bao giờ trả plaintext hoặc ghi vào log.
- **Cảnh báo an toàn**: **TUYỆT ĐỐI KHÔNG commit API Key thật vào Git repository**. Mọi khóa cấu hình đều được quản lý động qua DB.
- **SSRF Guard**: Toàn bộ yêu cầu ra ngoài đến Provider AI đều được kiểm tra DNS, chặn IP loopback, private (10/8, 172.16/12, 192.168/16), link-local, cloud metadata.

### 3. Grounding Tools, Quotas & Runtime Fallback
- **Grounding Tools**: AI chỉ truy vấn và tư vấn các quán đã được phê duyệt công khai (`PUBLISHED`) thông qua tool allowlist định nghĩa trong `AITaskConfigVersion`.
- **Hạn mức (Quota) & Khóa đồng thời**: Giới hạn số request/tokens theo ngày, tối đa 1 generation đồng thời/user.
- **Runtime Fallback**: Tự động chuyển đổi sang model dự phòng (Attempt 2) nếu model chính gặp sự cố kết nối trước chunk đầu tiên.

---

## 📂 Minh Chứng Xác Minh & Báo Cáo

- Minh chứng Giai đoạn 5: `docs/evidence/giai-doan-5/`
- Minh chứng Giai đoạn 6: `docs/evidence/giai-doan-6/`
- Minh chứng Giai đoạn 7: `docs/evidence/giai-doan-7/`
- Báo cáo hoàn tất Giai đoạn 6: `conversation/bao-cao-giai-doan-6.md`
- Báo cáo hoàn tất Giai đoạn 7: `conversation/bao-cao-giai-doan-7.md`

