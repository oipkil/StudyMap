# 🚀 StudyMap (SSG) — Hướng Dẫn Triển Khai (Deploy) Lên Server

Tài liệu này dành cho Quản trị viên hệ thống (DevOps / SysAdmin / Backend Developer) để đưa dự án **StudyMap (SSG)** lên máy chủ Production (VPS Linux: Ubuntu 22.04 / 24.04 LTS).

---

## 📌 1. Tổng Quan Kiến Trúc
- **Mô hình Monorepo (pnpm workspace)**
- **Frontend**: React 18, Vite, Ant Design 5, Tailwind CSS, MapLibre GL (OpenFreeMap). Build ra thư mục tĩnh: `apps/web/dist`.
- **Backend**: Node.js 20+, Express RESTful API, Socket.IO, TypeScript, Prisma ORM. Port nội bộ: `4000`.
- **Database & Cache**: PostgreSQL 16 (port nội bộ 5432), Redis 7 (port nội bộ 6379).
- **Web Server / Reverse Proxy**: Nginx + SSL Certbot (Let's Encrypt).

---

## ⚡ CÁCH 1: Triển Khai Bằng Docker Compose (Khuyên Dùng — Nhanh Nhất)

Cách này đóng gói toàn bộ PostgreSQL, Redis, Backend API và Mailpit vào Docker containers.

### Bước 1: Chuẩn bị máy chủ
Cài đặt Docker và Nginx trên Ubuntu:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 nginx certbot python3-certbot-nginx git
sudo systemctl enable docker
```

### Bước 2: Tải mã nguồn lên máy chủ
Giải nén source code vào thư mục `/opt/ssg`:
```bash
sudo mkdir -p /opt/ssg
sudo chown -R $USER:$USER /opt/ssg
# (Copy toàn bộ mã nguồn vào /opt/ssg)
cd /opt/ssg
```

### Bước 3: Cấu hình biến môi trường Production
Tạo file `deploy/.env.prod` từ file mẫu:
```bash
cp deploy/.env.prod.example deploy/.env.prod
nano deploy/.env.prod
```
*Điền các thông số bảo mật: `POSTGRES_PASSWORD`, `SESSION_SECRET`, `CLIENT_URL` (ví dụ `https://yourdomain.com`), `COOKIE_DOMAIN` (`yourdomain.com`).*

### Bước 4: Khởi động hệ thống Docker
```bash
cd /opt/ssg
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```
Kiểm tra trạng thái container:
```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod ps
```

### Bước 5: Chạy Migration & Seed Dữ Liệu
```bash
# Chạy migration tạo bảng cơ sở dữ liệu
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec ssg-server pnpm prisma:migrate

# Nạp dữ liệu mẫu quán học bài & trường đại học (tùy chọn)
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec ssg-server pnpm db:seed

# Tạo tài khoản Admin nhóm
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec ssg-server sh -c 'cd /app && TEAM_ADMIN_PASSWORD=MatKhauAdmin2026@ pnpm exec tsx scripts/create-team-admins.ts'
```

### Bước 6: Build Frontend & Cấu hình Nginx
1. Build frontend tĩnh:
```bash
# Nếu máy chủ có Node/pnpm:
pnpm install
pnpm --filter @ssg/web build

# Copy thư mục dist vào web root của Nginx:
sudo mkdir -p /var/www/studymap
sudo cp -r apps/web/dist/* /var/www/studymap/
```

2. Cài file cấu hình Nginx mẫu (có sẵn trong `deploy/nginx-studymap.conf`):
```bash
sudo cp deploy/nginx-studymap.conf /etc/nginx/sites-available/studymap.conf
# Sửa tên miền yourdomain.com trong file cấu hình:
sudo nano /etc/nginx/sites-available/studymap.conf
sudo ln -s /etc/nginx/sites-available/studymap.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

3. Cài đặt chứng chỉ SSL miễn phí (HTTPS):
```bash
sudo certbot --nginx -d yourdomain.com
```

---

## 🛠️ CÁCH 2: Triển Khai Trực Tiếp Bằng PM2 + Nginx (Không Dùng Docker)

### Bước 1: Yêu cầu cài đặt
- **Node.js**: Phiên bản 20.x LTS hoặc 22.x LTS
- **pnpm**: `npm install -g pnpm pm2`
- **PostgreSQL 16**: Đã tạo database `ssg_db`
- **Redis 7**: Đang chạy ở `localhost:6379`

### Bước 2: Cài đặt và build
```bash
cd /opt/ssg
pnpm install
cp .env.example .env
nano .env   # Cập nhật kết nối DB, Redis, Secret keys

# Build toàn bộ monorepo (shared, server, web)
pnpm build

# Tạo schema và seed database
pnpm --filter @ssg/server prisma:migrate
pnpm --filter @ssg/server db:seed
```

### Bước 3: Khởi chạy Backend với PM2
```bash
pm2 start apps/server/dist/index.js --name "ssg-api" -i max
pm2 save
pm2 startup
```

### Bước 4: Cấu hình Nginx phục vụ Frontend
Trỏ Nginx `root` tới `/opt/ssg/apps/web/dist` và reverse proxy các request `/api/` cùng `/socket.io/` về `http://127.0.0.1:4000`.

---

## 📋 Danh Sách Cổng Mặc Định
| Dịch vụ | Cổng | Ghi chú |
| :--- | :--- | :--- |
| **Nginx (Web)** | `80`, `443` | Cổng công khai tiếp nhận truy cập người dùng |
| **Backend API** | `4000` | Lắng nghe nội bộ (`127.0.0.1:4000`) |
| **PostgreSQL** | `5432` | Cơ sở dữ liệu chính |
| **Redis** | `6379` | Cache, sessions và queue xử lý ảnh |
| **Mailpit** | `8025` | Giao diện kiểm tra email demo nội bộ |

---

## 🔒 Kiểm Tra An Toàn Trước Khi Bàn Giao
1. Đã đổi `POSTGRES_PASSWORD` và `SESSION_SECRET` mặc định.
2. Đã bật `COOKIE_SECURE=true` khi chạy trên HTTPS.
3. Cổng database `5432` và Redis `6379` không mở trực tiếp ra ngoài Internet (chỉ cho phép truy cập từ localhost hoặc Docker network).
