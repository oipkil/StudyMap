# ☕ StudyMap (SSG) — Hướng Dẫn Bàn Giao & Cài Đặt Dành Cho Lập Trình Viên

Chào mừng bạn đến với dự án **StudyMap (SSG)** — Nền tảng Bản đồ Khám phá Không gian Học tập, Cà phê & Góc Ôn Thi Sinh viên.

Dự án được xây dựng theo kiến trúc **Monorepo (pnpm workspace)**, gồm Frontend React hiện đại, Backend Express API chuẩn RESTful, cơ sở dữ liệu PostgreSQL qua Prisma ORM và bản đồ vector MapLibre GL.

---

## 📁 1. Cấu Trúc Dự Án (Monorepo Layout)

```text
SSG/
├── apps/
│   ├── web/                    # Frontend SPA (React 18 + Vite + Ant Design 5 + MapLibre GL)
│   │   ├── src/
│   │   │   ├── components/     # Các component dùng chung (map, layout, places, community, search...)
│   │   │   ├── pages/          # Các trang (DiscoverPage, MapPage, PlaceDetailPage, Auth, Admin...)
│   │   │   ├── context/        # AuthContext, quản lý trạng thái đăng nhập
│   │   │   └── utils/          # Hàm tiện ích (openStatus, formatters...)
│   └── server/                 # Backend RESTful API (Express + TypeScript + Prisma ORM)
│       └── src/
│           ├── modules/        # Các module nghiệp vụ (places, community, auth, media, ai, admin...)
│           ├── middlewares/    # Authentication, rate limiting, error handling, validation
│           └── utils/          # Security, helpers
├── packages/
│   └── shared/                 # Types, schemas, constants dùng chung giữa web và server
├── prisma/                     # Prisma schema, migrations và seed scripts
├── docker/                     # Docker Compose file cho PostgreSQL, Redis, Mailpit
├── scripts/                    # Các script tự động hoá và kiểm thử
├── .env.example                # Mẫu cấu hình biến môi trường
└── package.json                # Root package.json điều phối workspace
```

---

## 🛠️ 2. Yêu Cầu Môi Trường (Prerequisites)

* **Node.js**: Phiên bản `>= 20.x`
* **pnpm**: Phiên bản `>= 9.x` (Cài đặt: `npm install -g pnpm`)
* **Docker & Docker Compose**: Để chạy PostgreSQL và Redis cục bộ (tuỳ chọn nếu đã có PostgreSQL sẵn).

---

## 🚀 3. Các Bước Cài Đặt & Chạy Dự Án (Quick Start)

### Bước 1: Cài đặt Dependencies
Từ thư mục gốc của dự án, chạy lệnh:
```bash
pnpm install
```
*(Lưu ý: Monorepo dùng pnpm nên vui lòng không dùng npm/yarn để tránh xung đột lockfile).*

---

### Bước 2: Thiết lập Biến Môi Trường (.env)
Sao chép file `.env.example` thành `.env`:
```bash
cp .env.example .env
```
Các thông số trong `.env.example` đã được cấu hình mặc định sẵn sàng để chạy trên môi trường Development cục bộ.

---

### Bước 3: Khởi động Cơ Sở Dữ Liệu (PostgreSQL & Redis)
Nếu máy bạn có Docker Desktop, khởi động database chỉ với 1 lệnh:
```bash
docker compose -f docker/docker-compose.dev.yml up -d
```
*(Cổng PostgreSQL mặc định: `5434`, Database: `ssg_db`, User: `ssg_admin`, Pass: `ssg_secret_password_2026`).*

---

### Bước 4: Chạy Migration & Nạp Dữ Liệu Mẫu (Database Setup)
```bash
# Tạo cấu trúc bảng theo schema Prisma
pnpm --filter @ssg/server prisma:migrate

# (Tuỳ chọn) Nạp dữ liệu mẫu các quán cà phê học bài, trường ĐH tại TP.HCM
pnpm --filter @ssg/server db:seed
```

---

### Bước 5: Chạy Ứng Dụng (Development Mode)

Bạn có thể chạy toàn bộ hệ thống cùng lúc từ thư mục gốc:
```bash
pnpm dev
```

Hoặc mở 2 cửa sổ terminal riêng biệt để dễ quan sát logs:

* **Terminal 1 — Backend API** (Port 4000):
  ```bash
  pnpm --filter @ssg/server dev
  ```
  👉 API Endpoint: `http://localhost:4000/api/v1`

* **Terminal 2 — Frontend Web** (Port 5173):
  ```bash
  pnpm --filter @ssg/web dev
  ```
  👉 Giao diện người dùng: `http://localhost:5173`

---

## 🌟 4. Các Tính Năng Đã Hoàn Thiện & Cần Lưu Ý

1. **Bản đồ số MapLibre GL**:
   * File chính: `apps/web/src/components/map/MapLibreView.tsx`.
   * Sử dụng vector tile từ OpenFreeMap, định vị toạ độ GPS chính xác.
   * Marker được hiển thị dạng **icon tròn mang ảnh đại diện của quán** với viền highlight thương hiệu. Đã khoá cứng CSS (`position: absolute; margin: 0; transition: none`) để ma trận tọa độ không bị trôi/lệch khi người dùng zoom in/out.

2. **Thư viện ảnh quán (Photo Gallery & Categorization)**:
   * File chính: `apps/web/src/pages/public/PlaceDetailPage.tsx` và `apps/web/src/components/media/PhotoGrid.tsx`.
   * Bố cục Collage thông minh: hiển thị tối đa 4 ô ảnh gọn gàng, ô cuối phủ `+N mục khác`. Bấm vào bất kỳ ảnh nào sẽ mở Lightbox xem toàn màn hình.
   * Bộ lọc ảnh thông minh: Tự động phân loại theo từ khoá (*Bàn học & Ổ cắm*, *Menu & Đồ uống*, *Không gian quán*), đếm số lượng ảnh thực tế trên từng nút và ẩn thanh lọc nếu quán chỉ có 1 ảnh duy nhất.

3. **Chỉ số học bài trực quan (Study Metrics)**:
   * Thước đo độ ồn 3 cấp độ (Thư viện thì thầm, Vừa phải nhạc Lofi, Náo nhiệt họp nhóm).
   * Mật độ ổ cắm (Từng bàn, Nhiều, Thưa thớt).
   * Tốc độ và độ ổn định Wi-Fi.
   * Biểu đồ / Cảnh báo khung giờ đông khách (Peak Hours) để sinh viên tránh giờ hết bàn.

4. **Trang khám phá & Bộ lọc sinh viên**:
   * Trang chủ `/`: Chế độ chia đôi màn hình (Danh sách quán bên trái, Bản đồ tương tác bên phải).
   * Bộ lọc nhanh: *Cú đêm 24/7*, *Ổ cắm từng bàn*, *Rất yên tĩnh*, *Wi-Fi mạnh*, *Gần trường ĐH*.

---

## 📦 5. Lệnh Build Sản Phẩm (Production Build)

Khi cần đóng gói để deploy:
```bash
# Build toàn bộ monorepo
pnpm build

# Hoặc build riêng Frontend
pnpm --filter @ssg/web build
```

Chúc bạn phát triển dự án thuận lợi! Nếu có thắc mắc về luồng code, hãy tham khảo thêm tài liệu trong thư mục `docs/`.
