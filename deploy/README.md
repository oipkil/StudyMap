# Triển khai SSG lên VPS (studymap.online)

Máy chủ: Ubuntu 24.04, Docker + Compose, nginx + certbot trên host. Mã nguồn tại `/opt/ssg`.

## Kiến trúc trên VPS

| Thành phần | Chạy ở | Cổng |
|---|---|---|
| PostgreSQL 16, Redis 7, Mailpit | Docker (`deploy/docker-compose.prod.yml`) | nội bộ (Mailpit UI 127.0.0.1:8025) |
| API + Socket.IO (`ssg-server`) | Docker, build từ `deploy/Dockerfile` | 127.0.0.1:4000 |
| Web (Vite build tĩnh) | nginx, `/var/www/studymap` | 80/443 |
| TLS | certbot (Let's Encrypt) | — |

## Cập nhật bản mới (từ máy dev)

```bash
node scripts/deploy-vps.mjs            # build web local, đồng bộ mã + web dist lên VPS, build lại image server, restart
node scripts/deploy-vps.mjs --with-db  # kèm dump DB dev + ảnh upload (CHỈ dùng lần đầu / khi muốn ghi đè dữ liệu prod)
```

Script cần SSH key có sẵn trong `~/.ssh` (user `ubuntu`). Biến môi trường prod nằm ở `/opt/ssg/deploy/.env.prod` trên VPS (không commit).

## Trên VPS

```bash
cd /opt/ssg
sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod ps
sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod logs -f ssg-server
# Tạo/đặt lại 5 tài khoản admin nhóm
sudo docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod exec ssg-server sh -c 'cd /app && TEAM_ADMIN_PASSWORD=... pnpm exec tsx scripts/create-team-admins.ts'
```

Email demo: https://studymap.online/mailpit/ (basic auth — xem `.htpasswd-mailpit`).
