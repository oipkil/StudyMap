# Báo cáo kiểm thử toàn bộ tính năng web SSG

Ngày chạy cuối: 21/09/2026 10:51 (đợt sửa 21/09 sáng: sinh viên tạo quán đầy đủ như admin, sửa lỗi 500 duyệt đề xuất trên prod, ô địa chỉ = tìm bản đồ).
Môi trường: máy dev Windows, Docker (PostgreSQL 5434, Redis 6380, Mailpit 8025), server `:4000`, web `:5173`.
Trình duyệt: Chromium (Playwright) — desktop 1440×900 và mobile iPhone 13.
Trợ lý AI: nhà cung cấp thật **SHOPSCAM (OpenAI-compatible, https://api.deepseek.com)** — model chính `deepseek-v4-pro`, dự phòng `deepseek-flash`.

**Không có số liệu nào trong báo cáo này được bịa.** Mọi dòng "Đã kiểm" đều có ảnh chụp trong `docs/evidence/full-run/` và log máy trong `docs/evidence/full-run/results.json`. Mục "Chưa kiểm / hạn chế" ghi rõ những gì tôi **không** chứng minh được.

---

## 1. Kết quả tổng

| Hạng mục | Kết quả |
|---|---|
| Kịch bản trình duyệt thật (`scripts/full-feature-run.mjs`) | **86/86 bước PASS**, 0 lỗi API 4xx/5xx ngoài dự kiến (chỉ có 1 lỗi 429 **cố ý** để kiểm tra hạn mức AI) |
| Bộ test tự động (`pnpm test`) | **132/132 pass** (9 test `@ssg/shared`, 123 test `@ssg/server` — 9 file) — chạy 2 lần liên tiếp đều xanh |
| Typecheck + build production | `apps/web` (Vite) ✓, `apps/server` (tsc) ✓, `packages/shared` ✓ |
| Console trình duyệt | Không còn lỗi runtime. Còn 3 loại **cảnh báo** antd không ảnh hưởng chức năng (xem mục 6) |

Cách chạy lại để tự kiểm chứng:

```bash
docker compose -f docker/docker-compose.yml up -d
pnpm --filter @ssg/server dev      # cửa sổ 1
pnpm --filter @ssg/web dev         # cửa sổ 2
node scripts/full-feature-run.mjs  # chạy toàn bộ 86 bước, chụp ảnh, tự dọn dữ liệu test
node scripts/build-report-section.mjs  # cập nhật lại mục 2 của báo cáo này từ results.json
pnpm test
```

Tài khoản seed: admin `admin@ssg.edu.vn / Admin@123456`; sinh viên `sinhvien1@hcmus.edu.vn`, `sinhvien2@hcmus.edu.vn` / `Student@123456`.

**Lưu ý khi chạy kịch bản:** không thao tác thủ công trong admin cùng lúc. Sáng 19/09 có 2 lần chạy báo FAIL các bước duyệt (đánh giá/bình luận/bài/báo cáo/nhãn dán) chỉ vì admin đang bấm duyệt tay song song (audit log ghi nhận các lượt duyệt thủ công lúc 02:23–02:27); chạy lại khi không thao tác tay thì 79/79 PASS.

---

## 2. Bảng tính năng — đã kiểm bằng trình duyệt (ảnh trong `docs/evidence/full-run/`)

Tổng: **97/97 bước PASS** (lần chạy 12:15:33 29/9/2026). Mỗi dòng là một bước kịch bản thật trên Chromium; cột "Bước" mô tả đúng thao tác và điều kiện kiểm tra.

### Khách

| # | Bước (thao tác + điều kiện pass) | Kết quả | Lỗi API | Ảnh |
|---|---|---|---|---|
| 1 | Trang khám phá (danh sách + bản đồ) | PASS |  | `01-guest-discover.png` |
| 2 | Tìm kiếm tiếng Việt không dấu | PASS |  | `02-guest-search.png` |
| 3 | Bộ lọc Không gian / Tiện ích | PASS |  | `03-guest-filter-space.png` |
| 4 | Bản đồ trang chủ: phóng to rồi thu nhỏ -> danh sách tải lại theo khung nhìn | PASS |  | `04-guest-map-zoom-refetch.png` |
| 5 | Bản đồ: nhãn Hoàng Sa / Trường Sa / Biển Đông hiện khi thu nhỏ, không còn "South China Sea" | PASS |  | `05-guest-map-islands.png` |
| 6 | Trang bản đồ riêng | PASS |  | `06-guest-map.png` |
| 7 | Chi tiết quán (gallery, giờ mở cửa, tiện ích) | PASS |  | `07-guest-place-detail.png` |
| 8 | Tab Đánh giá / Bài trải nghiệm / Hỏi đáp | PASS |  | `08-guest-place-tabs.png` |
| 9 | Trang 404: quán không tồn tại và đường dẫn sai đều có lối thoát (tìm quán / bản đồ) | PASS | 404 GET /api/v1/places/khong-co-quan-nay-539496; 404 GET /api/v1/places/khong-co-quan-nay-539496 | `09-guest-404.png` |
| 10 | Bản đồ: nút "Vị trí của tôi" cắm chấm xanh + hiện toạ độ hiện tại | PASS |  | `10-guest-map-my-location.png` |
| 11 | So sánh quán (trống + hướng dẫn) | PASS |  | `11-guest-compare-empty.png` |
| 12 | So sánh 2 quán (bảng đối chiếu Wi-Fi/ổ cắm/giá) | PASS |  | `12-guest-compare-two.png` |
| 13 | Trang đăng nhập | PASS |  | `13-guest-login.png` |
| 14 | Trang đăng ký | PASS |  | `14-guest-register.png` |
| 15 | Trang quên mật khẩu | PASS |  | `15-guest-forgot.png` |
| 16 | Khách không vào được /admin | PASS |  | `16-guest-admin-blocked.png` |
| 17 | Chat AI yêu cầu đăng nhập | PASS |  | `17-guest-chat-requires-login.png` |

### Tài khoản

| # | Bước (thao tác + điều kiện pass) | Kết quả | Lỗi API | Ảnh |
|---|---|---|---|---|
| 18 | Đăng ký tài khoản mới | PASS |  | `18-register-submitted.png` |
| 19 | Email xác minh gửi tới Mailpit | PASS |  | `19-email-verified.png` |
| 20 | Đăng nhập tài khoản mới | PASS |  | `20-new-user-logged-in.png` |
| 21 | Quên mật khẩu gửi email | PASS |  | `21-forgot-password-sent.png` |

### Sinh viên

| # | Bước (thao tác + điều kiện pass) | Kết quả | Lỗi API | Ảnh |
|---|---|---|---|---|
| 22 | Đăng nhập & về trang khám phá | PASS |  | `22-student-home.png` |
| 23 | Yêu thích quán (toggle) | PASS |  | `23-student-favorite.png` |
| 24 | Chi tiết quán: Viết đánh giá | PASS |  | `24-student-write-review.png` |
| 25 | Chi tiết quán: Gửi bình luận | PASS |  | `25-student-comment.png` |
| 26 | Chi tiết quán: Báo cáo vi phạm (chọn lý do + mô tả + gửi) | PASS |  | `26-student-report-submit.png` |
| 27 | Chi tiết quán: Viết bài trải nghiệm | PASS |  | `27-student-post.png` |
| 28 | Báo sửa thông tin / đóng góp cho quán | PASS |  | `28-student-contribution-modal.png` |
| 29 | Khối học bài: báo "quán còn bàn không" và xem giờ đông khách theo dữ liệu thật | PASS |  | `29-student-seat-report.png` |
| 30 | Bình luận dạng cây: trả lời bình luận của mình rồi xoá (bình luận gốc còn chỗ "đã bị xoá") | PASS |  | `30-student-comment-thread-delete.png` |
| 31 | Gợi ý quán mới: form đầy đủ như admin (chọn từ bản đồ, giờ, giá, tiện ích, trường động, ảnh, ghi chú) | PASS |  | `31-student-suggest-place.png` |
| 32 | Thu hồi đóng góp chưa duyệt ngay trên trang Đóng góp | PASS |  | `32-student-withdraw-contribution.png` |
| 33 | Chat AI: xem lại hội thoại cũ và xoá hội thoại | PASS |  | `33-student-chat-history-delete.png` |
| 34 | Hồ sơ (kiểu mạng xã hội): /me/contributions chuyển về tab "Đóng góp" — một danh sách, lọc bằng nút | PASS |  | `34-student-my-contributions.png` |
| 35 | Gửi bộ nhãn dán (tải ảnh + đặt tên + gửi duyệt) | PASS |  | `35-student-sticker-submit.png` |
| 36 | Bộ sưu tập: tạo mới | PASS |  | `36-student-collection-create.png` |
| 37 | Lưu quán vào bộ sưu tập (từ trang quán) | PASS |  | `37-student-save-to-collection.png` |
| 38 | Trang bộ sưu tập: hiện đúng quán vừa lưu (tên, ảnh, địa chỉ) + nút gỡ | PASS |  | `38-student-collection-detail.png` |
| 39 | Tab Đã lưu: quán yêu thích + bộ sưu tập cùng một trang (không Invalid Date) | PASS |  | `39-student-favorites-tab.png` |
| 40 | Thông báo: trang danh sách | PASS |  | `40-student-notifications.png` |
| 41 | Thông báo: popover chuông | PASS |  | `41-student-notification-popover.png` |
| 42 | Hồ sơ kiểu mạng xã hội: ảnh bìa, avatar, 4 tab (Bài viết / Ảnh / Đã lưu / Đóng góp), bài chờ duyệt có ảnh | PASS |  | `42-student-public-profile.png` |
| 43 | Sửa hồ sơ: đổi ảnh đại diện (cắt tròn) + giới thiệu -> hiện ngay trên hồ sơ và thanh menu | PASS |  | `43-student-profile-edit.png` |
| 44 | Ảnh bìa hồ sơ: tải lên + cắt ngang -> hiện ngay, khách xem được | PASS |  | `44-student-profile-cover.png` |
| 45 | Tab Ảnh của hồ sơ: gom ảnh từ đánh giá + bài viết | PASS |  | `45-student-profile-photos.png` |
| 46 | Chat AI: hội thoại mới + đồng ý quyền riêng tư + gửi câu hỏi + nhận trả lời (DeepSeek thật) | PASS |  | `46-student-chat-answer.png` |
| 47 | Hạn mức AI/ngày: vượt mức thì bị chặn 429 kèm thông báo | PASS |  | `47-student-ai-quota-blocked.png` |
| 48 | Chat AI: yêu cầu admin hỗ trợ | PASS |  | `48-student-chat-request-human.png` |
| 49 | Sinh viên không vào được /admin | PASS |  | `49-student-admin-blocked.png` |
| 50 | Ảnh đại diện vừa đổi: hồ sơ báo "đang chờ duyệt" hoặc đã được duyệt xong | PASS |  | `89-student-avatar-pending-state.png` |
| 51 | Xoá đánh giá của chính mình trên trang quán -> điểm quán tính lại | PASS |  | `90-student-delete-own-review.png` |

### Admin

| # | Bước (thao tác + điều kiện pass) | Kết quả | Lỗi API | Ảnh |
|---|---|---|---|---|
| 52 | Tổng quan hệ thống (badge pending, thống kê) | PASS |  | `50-admin-dashboard.png` |
| 53 | Quản lý địa điểm: danh sách | PASS |  | `51-admin-places.png` |
| 54 | Thêm quán: tên tự đặt; gõ địa chỉ -> chọn từ bản đồ -> toạ độ + cơ sở trường tự điền | PASS |  | `52-admin-place-geocode-pick.png` |
| 55 | Quản lý địa điểm: mở form sửa (nạp đúng dữ liệu mới nhất) | PASS |  | `53-admin-place-editor.png` |
| 56 | Form sửa: tab Hình ảnh (ảnh đã gắn hiện đúng) | PASS |  | `54-admin-place-editor-media.png` |
| 57 | Form sửa: tab Tiện ích chi tiết (trường động seed: nhóm Không gian / Học tập / Đồ uống / Dịch vụ / Tiện nghi / Liên hệ) | PASS |  | `55-admin-place-editor-dynamic.png` |
| 58 | Form sửa: Lưu & Xuất Bản Ngay | PASS |  | `56-admin-place-publish-now.png` |
| 59 | Duyệt đề xuất quán (hàng đợi đóng góp) | PASS |  | `57-admin-contributions.png` |
| 60 | Duyệt đề xuất: phê duyệt đề xuất mới nhất | PASS |  | `58-admin-contribution-approved.png` |
| 61 | Ẩn quán khỏi trang công khai rồi hiện lại; rà soát quán trùng | PASS |  | `59-admin-place-hide-duplicates.png` |
| 62 | Thư viện ảnh: tách ảnh nhãn dán, duyệt cả trang một lượt, xoá ảnh khỏi kho | PASS |  | `60-admin-media-queue.png` |
| 63 | Thông báo Zalo: thêm kênh (token mã hoá), hiện trong bảng rồi xoá | PASS |  | `61-admin-zalo-channel.png` |
| 64 | Kiểm duyệt đánh giá / bình luận / bài / bộ sưu tập (4 tab) | PASS |  | `62-admin-reviews.png` |
| 65 | Kiểm duyệt: duyệt đánh giá chờ | PASS |  | `63-admin-review-approved.png` |
| 66 | Kiểm duyệt: tab bình luận + duyệt bình luận chờ | PASS |  | `64-admin-comment-approved.png` |
| 67 | Kiểm duyệt: tab bài trải nghiệm + duyệt bài chờ | PASS |  | `65-admin-post-approved.png` |
| 68 | Kiểm duyệt: tab bộ sưu tập | PASS |  | `66-admin-reviews-tab-collections.png` |
| 69 | Báo cáo vi phạm: mở báo cáo mới + Xác nhận & Giải quyết | PASS |  | `67-admin-report-resolved.png` |
| 70 | Báo cáo vi phạm (hàng đợi) | PASS |  | `68-admin-reports.png` |
| 71 | Duyệt bộ nhãn dán: xem ảnh + Phê Duyệt Phát Hành | PASS |  | `69-admin-sticker-approved.png` |
| 72 | Cơ sở trường & danh mục: danh sách từ DB + thêm cơ sở mới bằng tìm trên bản đồ | PASS |  | `70-admin-reference-campus-added.png` |
| 73 | Thông tin động: tạo trường động mới (v1) | PASS |  | `71-admin-dynamic-field-created.png` |
| 74 | Quản lý media (ảnh hiện, duyệt/thu hồi) | PASS |  | `72-admin-media.png` |
| 75 | Thông báo hệ thống (announcement) + tạo mới | PASS |  | `73-admin-announcement-create.png` |
| 76 | Hỗ trợ sinh viên (ticket từ chat) | PASS |  | `74-admin-support.png` |
| 77 | Hỗ trợ: mở ticket + trả lời | PASS |  | `75-admin-support-reply.png` |
| 78 | Nhật ký hệ thống (audit log) | PASS |  | `76-admin-audit-logs.png` |
| 79 | Quản lý người dùng | PASS |  | `77-admin-users.png` |
| 80 | Cấu hình AI: nhà cung cấp & model | PASS |  | `78-admin-ai-providers.png` |
| 81 | Cấu hình AI: tác vụ & phiên bản prompt | PASS |  | `79-admin-ai-task-config.png` |
| 82 | Cấu hình AI: giám sát hội thoại | PASS |  | `80-admin-ai-conversations.png` |

### Công khai sau duyệt

| # | Bước (thao tác + điều kiện pass) | Kết quả | Lỗi API | Ảnh |
|---|---|---|---|---|
| 83 | Đánh giá đã duyệt hiện trên trang quán dạng thẻ (avatar, sao, nội dung, ảnh) + điểm cập nhật | PASS |  | `81-public-review-visible.png` |
| 84 | Trang quán: mục Tiện ích chi tiết hiện đúng nhóm + giá trị admin vừa nhập | PASS |  | `82-public-dynamic-fields.png` |
| 85 | Bài trải nghiệm đã duyệt: mở trang chi tiết bài viết | PASS |  | `83-public-post-detail.png` |
| 86 | Hồ sơ công khai: KHÔNG lộ đánh giá đang chờ duyệt | PASS |  | `84-public-profile-no-pending-leak.png` |
| 87 | Nhãn dán đã duyệt xuất hiện trong bộ chọn (API public) | PASS |  | `85-public-sticker-available.png` |
| 88 | Bình luận đã duyệt hiện với người khác | PASS |  | `86-public-comment-visible.png` |
| 89 | Banner thông báo hệ thống hiện trên trang chủ | PASS |  | `87-public-announcement-banner.png` |
| 90 | Sinh viên 2 không đọc được đóng góp/bộ sưu tập riêng của sinh viên 1 (IDOR) | PASS |  | `88-public-idor-check.png` |

### Mobile

| # | Bước (thao tác + điều kiện pass) | Kết quả | Lỗi API | Ảnh |
|---|---|---|---|---|
| 91 | Mobile: khám phá | PASS |  | `91-mobile-discover.png` |
| 92 | Mobile: bản đồ | PASS |  | `92-mobile-map.png` |
| 93 | Mobile: chi tiết quán | PASS |  | `93-mobile-place-detail.png` |
| 94 | Mobile: hồ sơ (kiểu mạng xã hội) | PASS |  | `94-mobile-profile.png` |
| 95 | Mobile: hồ sơ cá nhân tab Đóng góp (không tràn ngang) | PASS |  | `95-mobile-profile-contributions.png` |
| 96 | Mobile: thông báo | PASS |  | `96-mobile-notifications.png` |
| 97 | Mobile: chat AI toàn màn hình | PASS |  | `97-mobile-chat.png` |

### Tính năng chỉ kiểm bằng test tự động (không có ảnh, có trong `pnpm test`)

| Nhóm | File test | Nội dung chính |
|---|---|---|
| Xác thực & phân quyền | `auth-and-admin.test.ts` (18) | đăng nhập sai 401, khách/sinh viên vào admin 401/403, bảo vệ admin cuối cùng (khóa/hạ quyền), token xác minh email (dùng lại/hết hạn bị chặn), quên & đặt lại mật khẩu thu hồi phiên, CSRF, IDOR bộ sưu tập, Socket.IO với session hợp lệ/bị thu hồi |
| Bảo mật | `security-hardening.test.ts` (19) | chặn leo quyền qua payload đăng ký, lọc XSS (script/iframe/on*/javascript:), X-Request-Id, che password/apiKey trong log, không lộ SQL/tên bảng khi lỗi Prisma, quán ẩn biến mất khỏi tìm kiếm/bản đồ/so sánh/SEO, tự xóa tài khoản ẩn danh hóa, /ready, sitemap.xml, robots.txt, thống kê dashboard |
| Media pipeline | `media-pipeline.test.ts` (16) | magic bytes chặn file giả, GIF động → cách ly + variants, **cắt GIF/WebP động giữ frame & delay**, chống xem trộm, preview chủ ảnh/admin, gateway chỉ phục vụ ảnh đã duyệt & đang được xuất bản, thu hồi ảnh, BullMQ + Redis thật, file hỏng → FAILED, contact sheet & scrubber >30 frames |
| Trường động & phiên bản quán | `dynamic-fields-and-revisions.test.ts` (8) | tạo/đổi phiên bản trường động (bất biến), revision quán cô lập (public chỉ thấy bản đã duyệt), phát hiện xung đột 3-way, chặn duyệt bản cũ, force override |
| Cộng đồng & khám phá | `community-and-discovery.test.ts` (17) | tìm không dấu, bounding box bản đồ, lọc tiện ích/giá, đề xuất quán, 1 user 1 review, ẩn review tính lại điểm, vote hữu ích, sticker, báo cáo, yêu thích, so sánh |
| Realtime & vận hành | `realtime-and-operations.test.ts` (10) | thông báo đúng người, review chờ duyệt không phát vào room công khai, outbox retry/idempotent, reconnect theo cursor, announcement theo lịch/đối tượng/phiên bản + sanitize, khóa tài khoản đang online, support case đổi trạng thái realtime, audit log |
| AI đa nhà cung cấp | `ai-chat-and-providers.test.ts` (22) | tạo provider/model/đổi mặc định, key được che + AES-256-GCM, SSRF guard baseUrl, streaming Socket.IO đúng thứ tự + token usage, idempotency key, dừng luồng → INTERRUPTED, circuit breaker, fallback runtime, usageEstimated khi provider không trả usage, sanitize lỗi, retry tin nhắn |

---

## 3. Lỗi tìm thấy và đã sửa trong đêm (tất cả đã kiểm lại bằng trình duyệt)

| # | Lỗi (trước) | Nguyên nhân | Sửa |
|---|---|---|---|
| 1 | **Mất tiện ích / thực đơn / phòng học nhóm / cơ sở trường khi admin bấm Lưu** (lỗi bạn gặp nhiều lần) | `form.validateFields()` của antd chỉ trả về trường ở tab **đã mở**; các tab chưa mở bị coi là rỗng → ghi đè bằng `UNKNOWN`/`[]` | Dùng `form.getFieldsValue(true)` + `forceRender` mọi tab; kịch bản #40 giờ kiểm tra từng trường sau khi lưu |
| 2 | Lịch mở cửa theo ngày (T7/CN 24/24) bị ghi đè thành 1 khung giờ chung dù không sửa giờ | Form chỉ có 1 khung giờ, luôn áp cho 7 ngày | Giữ nguyên lịch 7 ngày nếu admin không sửa ô giờ; tab "Giờ mở cửa" hiển thị lịch chi tiết từng ngày |
| 3 | Form sửa quán không có ô "Cơ sở trường gần nhất" → `nearestCampusId` mất, AI và bộ lọc không biết quán gần trường nào | Thiếu field | Thêm Select cơ sở trường (dữ liệu từ `/places/meta`) |
| 4 | Editor tự điền thực đơn giả ("Cà Phê Đen 20.000 / Bạc Xỉu 25.000") và lưu như dữ liệu thật | Giá trị mặc định bịa | Bỏ mặc định; chỉ lưu thực đơn khi admin nhập món |
| 5 | **Link xác minh email không có trang đích** (`/verify-email?token=` → về trang chủ, user vĩnh viễn "Chưa xác thực") | Web thiếu route | Thêm `VerifyEmailPage` gọi API và báo kết quả; kịch bản #15 kiểm `isEmailVerified=true` |
| 6 | **Báo cáo vi phạm gửi luôn lỗi 422** | Web gửi `reason/details`, API nhận `reasonCode/description` | Sửa payload; admin xem lý do bằng tiếng Việt |
| 7 | **Admin không thể xử lý báo cáo** (nút chỉ hiện khi status `PENDING`, còn DB dùng `OPEN`) | Sai enum | Hiện nút cho `OPEN`/`INVESTIGATING`; nhãn trạng thái tiếng Việt |
| 8 | **Nhật ký hệ thống luôn trống** dù có 2 trang | API trả `items/targetEntity/adminUser`, trang đọc `logs/entityType/actor` | API trả thêm alias đúng hợp đồng + hỗ trợ `?search=` |
| 9 | Nhiều thao tác admin không ghi audit log (duyệt quán, đề xuất, đánh giá, nhãn dán, media, trường động, khóa user) | Chưa gọi | Thêm `lib/audit.ts` và ghi log ở tất cả điểm trên |
| 10 | **Bộ chọn nhãn dán luôn trống** (gọi URL không tồn tại `/community/sticker-packs`) | Sai URL + sai shape | Sửa URL, API trả `stickers[]` kèm `url`; bình luận trả kèm ảnh nhãn dán |
| 11 | Sinh viên **không có màn hình nào để gửi bộ nhãn dán** (chỉ có API) | Thiếu UI | Thêm tab "Bộ Nhãn Dán" + modal tải ảnh trong "Đóng góp của tôi" |
| 12 | Ảnh nhãn dán / ảnh đính kèm review, bài viết, bình luận **không bao giờ hiển thị công khai** sau khi duyệt | Không tạo `AssetUsage` khi duyệt | `lib/asset-usage.ts`: duyệt nội dung → cấp quyền công khai cho ảnh gắn kèm (sticker/review/post/comment) |
| 13 | Admin duyệt nhãn dán không thấy ảnh | API thiếu `imageUrl` preview | Thêm `imageUrl?preview=true` cho admin |
| 14 | Hồ sơ công khai lộ đánh giá / bài viết **đang chờ duyệt** | Chỉ lọc `state=PUBLISHED` (mặc định ngay khi tạo) | Chỉ trả nội dung có bản đã duyệt; kịch bản #63 kiểm tra không lộ |
| 15 | Trang so sánh gọi `GET /places/compare?ids=` nhưng API chỉ có `POST` → 404, bảng trống | Thiếu route | Thêm `GET`, API trả cấu trúc đúng với trang (tiện ích enum, campus, ảnh bìa, giờ, phòng học nhóm); nhãn tiếng Việt thay mã `STRONG/MANY` |
| 16 | Trang so sánh & popup bản đồ hiển thị **5.0 sao cho quán chưa có đánh giá** | `rating \|\| 5` | Hiện "Chưa có đánh giá" |
| 17 | Chi tiết quán bịa "07:00 - 22:30 hàng ngày", "Giảm 10% khi xuất trình thẻ SV", "Quạt gió" khi không có dữ liệu | Chuỗi mặc định | Hiện "Chưa có thông tin"; thêm Độ ồn / Phù hợp học bài / Học nhóm / Gửi xe / Phòng riêng theo dữ liệu thật |
| 18 | Chi tiết quán không hiển thị phòng học nhóm (đọc `customFields.study_rooms` không tồn tại) | Sai đường dẫn dữ liệu | Đọc từ `dynamicFieldValues` (REPEATER) |
| 19 | AI trả "chưa tìm thấy quán gần KHTN" vì tool bắt buộc `campusId` (UUID) và lọc ổ cắm theo trường không tồn tại | Tool thiết kế sai | Tool nhận tên/viết tắt trường ("KHTN"), tự khớp cơ sở, trả tiện ích thật + ghi rõ `UNKNOWN` = chưa có thông tin; nới lỏng khi không khớp từ khóa |
| 20 | Chat hiển thị Markdown thô (`**đậm**`, `- `) | Không render | Thêm `LiteMarkdown` (an toàn, không innerHTML) |
| 21 | Chat trên mobile nằm trong panel nhỏ | — | Toàn màn hình khi `< 640px` |
| 22 | Lịch sử ticket hỗ trợ gán nhãn "Sinh viên" cho câu trả lời của AI; Markdown thô | Thiếu nhánh `AI` | Nhãn "Trợ lý AI (trước khi chuyển)", bỏ ký hiệu Markdown |
| 23 | Tab "Bộ sưu tập" ở admin liệt kê cả bộ sưu tập **riêng tư** của sinh viên | Không lọc | Chỉ hiện bộ yêu cầu công khai / đã công khai; thêm cột "Hiển thị" |
| 24 | Trang "Đóng góp của tôi" nhảy về tab đầu sau mỗi lần tải lại | Tabs bị unmount khi loading | Giữ tab đang mở, chỉ Spin lần đầu |
| 25 | Badge số chờ duyệt ở sidebar admin không giảm sau khi duyệt | Chỉ tải lúc mount | Tải lại khi đổi trang |
| 26 | Trang bài viết có khoảng trống lớn vô nghĩa | `minHeight: 200` | Bỏ |
| 27 | Banner thông báo chiếm gần hết màn hình đầu trên mobile | 2 banner cỡ lớn | Mobile: 1 banner gọn |
| 28 | Nhiều màu lệch bảng màu (xanh dương antd, tím, hồng) và emoji trong nhãn | — | Thống nhất 1 màu nhấn xanh lá `#2F6B4F`, bỏ emoji khỏi nhãn |
| 29 | ~70 cảnh báo antd v6 (`message`→`title`, `destroyOnClose`, `bodyStyle`, …) | API cũ | Đã chuyển đổi trong 30 file |
| 30 | Test AI (5 test) đỏ: "text part 1 not found" | Mock model không phát `text-start/text-end` theo giao thức AI SDK v7 | Chuẩn hóa chunk mock; test sticker/so sánh/đề xuất được sửa cho khỏi phụ thuộc thứ tự chạy |

### Đợt sửa sáng 19/09 (theo phản hồi trực tiếp của bạn, ảnh trong cùng thư mục)

| # | Lỗi / yêu cầu | Sửa |
|---|---|---|
| 31 | Badge "Duyệt Đề Xuất Quán 2" nhưng bảng trống | Badge đếm nhầm cả **phiên bản quán** chờ duyệt (2 bản cũ #2, #3 từ lần bạn test tay, đã bị bản mới thay thế). Tách badge: đề xuất quán riêng, phiên bản quán hiện ở "Quản Lý Địa Điểm"; khi duyệt bản mới, các bản cũ hơn còn chờ tự đóng với ghi chú "Bị thay thế bởi phiên bản #N" |
| 32 | Sidebar admin có thanh cuộn thô, cắt mục cuối trên màn hình thấp | Menu cuộn trong khung riêng với thanh cuộn mảnh, nút "Về Trang Public" luôn ở đáy |
| 33 | Tên người dùng trên navbar rớt xuống dòng dưới avatar | Khối avatar + tên thành flex không wrap, cắt bằng dấu … |
| 34 | Tab "Quán yêu thích": ảnh stock CAFE, tên giả "Quán học bài", "Lưu ngày: Invalid Date" | API yêu thích trả thẻ quán thật (tên, ảnh bìa, địa chỉ, điểm, ngày lưu); giao diện dùng đúng trường; không còn ảnh stock ở bất kỳ trang nào (Khám phá, bộ sưu tập, yêu thích) |
| 35 | Bộ sưu tập: item không bao giờ có thông tin quán (bảng `collection_items` chỉ có `placeId`), trang bộ sưu tập hiện "Địa điểm"/"TP. Hồ Chí Minh" giả; **không có màn hình nào để thêm quán vào bộ sưu tập** | Thêm helper `lib/place-card.ts` gắn thẻ quán vào item (me + public); endpoint `GET /community/collections/:id` (công khai nếu đã duyệt, chủ sở hữu/admin luôn xem được); nút **"Lưu Vào Bộ Sưu Tập"** trên trang quán (chọn bộ có sẵn / tạo nhanh); chủ sở hữu gỡ quán ngay trên trang bộ sưu tập; chặn thêm trùng / quán chưa công khai |
| 36 | Bản đồ trang chủ "cứ zoom tới The Coffee House" khi thu nhỏ | Effect bay-tới-quán chạy lại mỗi lần danh sách quán tải lại (kéo/thu phóng → fetch → bay ngược). Chỉ bay khi **lựa chọn đổi** |
| 37 | Phóng to rồi quán "mất luôn" khỏi bản đồ + danh sách | Cờ "chuyển động do code" làm nuốt sự kiện di chuyển kế tiếp → không tải lại theo khung nhìn. Bỏ cờ; luôn báo khung nhìn mới; thông báo trống nói rõ "thu nhỏ bản đồ để thấy thêm quán" |
| 38 | Di chuột lên thẻ quán → bản đồ bay tới quán (gây 36/37) | Thành **chế độ bật/tắt** "Bám theo bản đồ" (mặc định Tắt, nhớ trong trình duyệt); tắt thì di chuột chỉ đổi viền thẻ |
| 39 | Bản đồ thiếu Hoàng Sa – Trường Sa, hiện "South China Sea" | Thêm lớp nhãn riêng luôn hiển thị: **Quần đảo Hoàng Sa (Việt Nam)**, **Quần đảo Trường Sa (Việt Nam)**, **Biển Đông**; ẩn nhãn "South China Sea" của lớp nền. Có bước kịch bản kiểm tra 3 nhãn xuất hiện |
| 40 | Hồ sơ người dùng theo mẫu Ant Design Pro "Account Center" | Bố cục 2 cột: thẻ hồ sơ trái (avatar ở giữa, tên, @username, giới thiệu, vai trò, ngày tham gia, số liệu), cột phải là tab. Bỏ nhãn bịa "Sinh viên HCMUS" → vai trò thật |
| 41 | Gom `/me/collections` và `/me/contributions` vào hồ sơ thành tab | Chính chủ thấy tab: Bộ sưu tập của tôi · Quán yêu thích · Đóng góp của tôi · Đánh giá · Bài viết. Route cũ tự chuyển hướng về đúng tab; menu người dùng có "Hồ Sơ Của Tôi" |
| 42 | "Cho nó rộng ra tí" | Trang hồ sơ rộng 1400px, cột trái 6/24, cột phải 18/24 |
| 43 | Tab Đóng góp trên mobile tràn ngang (bảng, nút) | Bảng cuộn ngang trong khung riêng, cỡ nhỏ; 3 thẻ số liệu gộp thành 1 dải; nút xuống dòng; padding thẻ nhỏ hơn trên mobile. Kịch bản mobile kiểm tra không có phần tử tràn khỏi màn hình |
| 44 | Địa chỉ thẻ quán ở Khám phá bịa "Quận 5, TP.HCM" | API danh sách trả `address` thật; không có thì "Chưa có địa chỉ" |
| 45 | Test "sticker" thỉnh thoảng đỏ khi chạy cả bộ | Test dùng asset của file khác đang bị xoá song song → luôn tự tạo asset riêng |

---

## 4. Dữ liệu seed đã được khôi phục

Trong lúc kiểm tra, tôi phát hiện 2 quán seed đã bị các lần lưu trước (lỗi #1, #2, #3) làm mất dữ liệu ở bản đang xuất bản. Tôi đã khôi phục từ revision 1 (bản seed) bằng SQL trực tiếp trên DB dev — **chỉ sửa bản đang xuất bản, lịch sử revision giữ nguyên**:

| Quán | Đã khôi phục |
|---|---|
| Cà Phê Học Bài Cú Đêm 24/7 | tiện ích (Wi-Fi mạnh, ổ cắm mỗi bàn, rất yên tĩnh…), cơ sở trường KHTN CS1, 2 phòng học nhóm (trường động), lịch T2–T6 20:00–06:00 qua đêm + T7/CN 24/24, giá 30–50k, ưu đãi; địa chỉ `183 Trần Bình Trọng, Phường 3, Quận 5, TP.HCM` |
| The Coffee House – Nguyễn Văn Cừ | cơ sở trường, thực đơn 2 nhóm, lịch 07:00–22:30, địa chỉ `249 Nguyễn Văn Cừ, Phường 4, Quận 5, TP.HCM` (trước đó là "Thành Phố Hồ Chí Mính" từ lần bạn test) |

Ảnh gallery bạn đã gắn được giữ nguyên.

---

## 5. Kịch bản kiểm thử tự dọn dữ liệu

`scripts/full-feature-run.mjs` gắn mã RUN (6 số) vào mọi dữ liệu nó tạo; kết thúc gọi `scripts/cleanup-run-data.mjs <RUN>` xóa: user test, đề xuất, quán tạo từ đề xuất, đánh giá, bình luận, bài viết, bộ sưu tập, thông báo, hội thoại chat + ticket, bộ nhãn dán, trường động, báo cáo vi phạm; trả địa chỉ quán Cú Đêm về bản gốc; tính lại điểm quán.

Dấu vết còn lại sau mỗi lần chạy (không xóa, để bạn kiểm chứng): **1 revision mới** của quán Cú Đêm (bước #40 lưu & xuất bản) và các dòng audit log.

---

## 6. Chưa kiểm được / hạn chế còn lại (nói thẳng)

| Hạng mục | Tình trạng |
|---|---|
| Backup / restore | **Không làm** — theo yêu cầu của bạn |
| Nhà cung cấp AI khác DeepSeek (OpenAI, Gemini…) | Chưa thử với key thật; chỉ có test mock. Adapter dùng chuẩn OpenAI-compatible |
| Fallback model khi DeepSeek lỗi thật | Chỉ có test mock (`ai-chat-and-providers` #14); đêm nay DeepSeek không lỗi nên chưa quan sát fallback thật |
| Ảnh động (GIF/WebP) upload + cắt + soi khung hình trên giao diện | Chỉ có test tự động (`media-pipeline`); kịch bản trình duyệt chỉ tải PNG/JPEG |
| Gửi email thật | Chỉ Mailpit local |
| Tải nặng / nhiều người dùng đồng thời | Không đo |
| Rate limit dev đang nới (`app.ts`: 20000/1000/2000 mỗi 15 phút) để chạy kịch bản; giá trị production giữ nguyên theo `isProd` | Cần xác nhận số production trước khi deploy |
| Cảnh báo antd còn lại: `message` static (cần bọc `<App>`), `List` deprecated, 1 cảnh báo `useForm` ở modal sticker | Không ảnh hưởng chức năng; cần refactor riêng |
| Form sửa quán chỉ có **1 khung giờ chung**; muốn đặt giờ khác nhau từng ngày phải sửa DB/API | Lịch có sẵn được giữ nguyên nếu không sửa giờ (đã kiểm) |
| Tài khoản lạ trong DB dev: `admin / 5384swift@uberip.com` (vai trò sinh viên) | Không phải do tôi tạo; tôi **không xóa** |
| Bảng "Tiện ích & giá" trong form sửa quán chưa có ô cho `carParking`, `petFriendly`, `wheelchairAccessible` | Giá trị cũ được giữ nguyên khi lưu, chỉ chưa sửa được từ UI |

---

## 7. Danh sách file thay đổi chính trong đêm

Server: `lib/asset-usage.ts` (mới), `lib/audit.ts` (mới), `modules/admin/community.admin.routes.ts`, `modules/admin/places.admin.routes.ts`, `modules/admin/audit-logs.admin.routes.ts`, `modules/admin/users.routes.ts`, `modules/admin/field-definitions.routes.ts`, `modules/media/media.routes.ts`, `modules/community/community.routes.ts`, `modules/users/users.public.routes.ts`, `modules/places/places.routes.ts`, `modules/ai/tools/place.tools.ts`, `modules/ai/provider.registry.ts`, 2 file test.

Web: `pages/auth/VerifyEmailPage.tsx` (mới), `components/community/StickerPackSubmitModal.tsx` (mới), `components/ai/LiteMarkdown.tsx` (mới), `utils/amenityLabels.ts` (mới), `components/admin/PlaceEditorDrawer.tsx`, `components/community/StickerPicker.tsx`, `components/community/ReportModal.tsx`, `components/ai/FloatingChatWidget.tsx`, `components/announcements/AnnouncementBanner.tsx`, `components/layout/AdminLayout.tsx`, `pages/admin/*` (Reports, Reviews, Stickers, Support, AuditLogs…), `pages/public/*` (Discover, PlaceDetail, PlaceComparison, PostDetail, UserProfile, Map), `pages/me/UserContributionsPage.tsx`, và ~30 file chuyển prop antd v6.

Kịch bản: `scripts/full-feature-run.mjs` (73 bước), `scripts/cleanup-run-data.mjs`.

---

## 8. Triển khai VPS — https://studymap.online (19/09/2026)

| Hạng mục | Chi tiết |
|---|---|
| Máy chủ | VPS `180.93.100.36` (Ubuntu 24.04, 2 vCPU, 8 GB), Docker Compose |
| Tên miền | `studymap.online`, `www.studymap.online` — DNS Cloudflare (A → VPS, chưa bật proxy) |
| TLS | Let's Encrypt (certbot), HTTP tự chuyển sang HTTPS |
| Dịch vụ | PostgreSQL 16 + Redis 7 + Mailpit (Docker), API `ssg-server` (Docker, image build từ `deploy/Dockerfile`), web tĩnh + reverse proxy bằng nginx |
| Dữ liệu | Dump từ DB dev (2 quán seed đã khôi phục, cấu hình AI DeepSeek, 5 tài khoản admin nhóm) + toàn bộ ảnh đã upload |
| Email demo | https://studymap.online/mailpit/ (đăng nhập basic auth — mật khẩu gửi riêng) |
| Kiểm chứng sau deploy (Playwright từ máy ngoài) | trang chủ + ảnh quán tải được, đăng nhập `admin1`, chi tiết quán, **chat AI DeepSeek trả lời có tên quán**, dashboard admin, đăng ký → email xác minh vào Mailpit, mobile — 0 lỗi API/console. Ảnh: `docs/evidence/prod/01..05` |

Tài khoản nhóm (5 admin): `admin1@studymap.online` … `admin5@studymap.online` (mật khẩu chung do script `scripts/create-team-admins.ts` đặt; đổi bằng `TEAM_ADMIN_PASSWORD=...`). Tài khoản seed cũ vẫn dùng được.

Cập nhật bản mới: `node scripts/deploy-vps.mjs` (build web local → đồng bộ mã → build image server trên VPS → migrate → restart). Chi tiết: `deploy/README.md`.

Lỗi phát hiện khi deploy và đã sửa: (1) gói `@ssg/shared` trỏ `main` vào file `.ts` nên `node dist/index.js` không chạy được ngoài môi trường dev → thêm `exports` (require → `dist`, import → `src`); (2) `storageKey` ảnh lưu đường dẫn tuyệt đối Windows (`D:\...`) nên trên Linux ảnh 404 → media gateway tự tìm lại theo tên file trong `uploads/`; (3) thêm `TRUST_PROXY` để rate-limit theo IP thật sau nginx; (4) trang "quên mật khẩu" không còn nhắc tới `localhost:8025`.

Hạn chế: email chỉ vào Mailpit demo (chưa gửi thật); chưa bật Cloudflare proxy/WAF; chưa có backup tự động DB trên VPS (bạn đã yêu cầu không làm backup/restore).

### Đợt sửa 19/09 buổi sáng (tiếp)

| # | Yêu cầu / lỗi | Sửa |
|---|---|---|
| 46 | Sidebar admin xấu (nền xanh đen, không nhóm) | Sidebar sáng theo bảng màu chung: nhóm chức năng (Tổng quan / Địa điểm / Kiểm duyệt / Vận hành), badge số việc chờ, thẻ người dùng + đăng xuất ở đáy, thu gọn được và nhớ trạng thái; header hiện tên trang |
| 47 | Admin "vỡ" ở màn hình laptop 1280px (bảng bị ép cột, chữ vỡ từng ký tự) | Mọi bảng admin cuộn ngang trong khung riêng (`scroll x`), cột nhà cung cấp AI không wrap, tiêu đề trang ngắn gọn, bảng điều khiển thiết kế lại (ô số liệu đồng nhất, hàng đợi kiểm duyệt, hạn mức AI) |
| 48 | Admin trên điện thoại | Sidebar thành Drawer mở từ nút menu; header/nội dung gọn; khối tiêu đề trang tự xuống dòng; form thêm/sửa quán: nút lưu ở footer, lưới toạ độ 2 cột, không tràn ngang; thư viện ảnh dùng bộ lọc Segmented; kịch bản mobile kiểm tra không phần tử nào tràn khỏi màn hình trên toàn bộ trang public + admin |
| 49 | Public trên điện thoại | Gallery chi tiết quán: ảnh bìa rộng + dải ảnh phụ cuộn ngang (trước đây ảnh bìa cao ~1000px); trang so sánh: cột tiêu chí hẹp hơn, header xuống dòng |
| 50 | "Tên quán chọn từ Google Maps cho chuẩn" | Ô tên quán (form admin + form gợi ý của sinh viên) thành ô tìm địa điểm kiểu Google Maps qua nhà cung cấp bản đồ đang dùng (OpenStreetMap/Photon): gõ tên → chọn → tự điền địa chỉ + toạ độ + gợi ý cơ sở trường gần nhất; **dán link Google Maps hoặc toạ độ** cũng được. API proxy `GET /api/v1/places/geocode` + `/geocode/reverse` (khoanh vùng TP.HCM, cache 5 phút) |
| 51 | "Vị trí của tôi" khi không có GPS: cho tìm khu vực | Modal chọn vị trí có ô tìm khu vực (đường/phường/quận/quán) + nút thử lại GPS + danh sách cơ sở trường |
| 52 | "Cơ sở trường có phải hard-code?" | Danh sách lấy từ bảng `campuses` nhưng chỉ có 2 dòng seed và **không có màn hình quản lý**. Thêm trang admin **"Cơ sở trường & danh mục"** (thêm/sửa/xoá cơ sở trường có tìm trên bản đồ; thêm/sửa/ẩn danh mục quán) + API `/admin/reference/*`; bỏ danh sách trường cài cứng trong bản đồ (nay đọc từ DB); script `scripts/seed-campuses.mjs` nạp 11 cơ sở ĐHQG-HCM (đã chạy trên dev và prod) |

Kịch bản trình duyệt hiện **81 bước**, tất cả PASS; test tự động 125/125; đã deploy lên https://studymap.online.

### Đợt sửa 20/09 (tối) — đánh giá/bài viết kiểu mạng xã hội, ảnh có cắt, hồ sơ kiểu Facebook, trường động đầy đủ

| # | Yêu cầu | Đã làm |
|---|---|---|
| 53 | "Chưa có upload ảnh và cắt ảnh khi tải lên" | Hộp cắt ảnh **kéo–thả thật** (react-easy-crop): kéo chọn vùng, lăn chuột/kéo thanh phóng to, xoay 90°, preset Gốc/1:1/4:3/3:4/16:9; ảnh cắt ngay trên trình duyệt rồi tải lên (ảnh điện thoại 4000px thu về ≤2000px). GIF động tải thẳng để giữ chuyển động. Dùng ở: đánh giá, bài viết, ảnh đại diện, tải ảnh quán (admin, chọn nhiều ảnh), thư viện ảnh admin. Cắt lại ảnh đã có trong kho cũng bằng kéo–thả (server cắt bằng Sharp, giữ khung hình GIF, phục vụ bản gốc qua `variant=source`). Bỏ form cắt bằng ô số cũ |
| 54 | "Sinh viên tạo bài viết về quán, vẫn cần admin duyệt" | Composer bài viết kiểu mạng xã hội (`PostComposerModal`): chọn quán (gắn sẵn khi mở từ trang quán, hoặc tìm theo tên), tiêu đề, nội dung, dải ảnh (ảnh đầu = ảnh bìa). Gửi vào hàng đợi duyệt (`POST /community/posts`, `contentBlocks` paragraph + image); admin thấy **ảnh đính kèm** ngay trong modal duyệt; duyệt xong ảnh mới công khai. Mở từ trang quán ("Viết Bài Trải Nghiệm") hoặc ô "Bạn muốn chia sẻ quán nào?" trên hồ sơ |
| 55 | "Bài đánh giá dạng Facebook: viết + upload ảnh" | `WriteReviewModal` viết lại: avatar + tên, chọn sao to (có chữ Tệ → Tuyệt vời), ô kể cảm nhận, dải ảnh (tối đa 10, có cắt), "Thêm chi tiết" gập lại (điểm từng tiêu chí, ngày ghé, chi tiêu, điểm cộng/trừ); nút Đăng chỉ bật khi đủ điều kiện và ảnh tải xong. Thẻ đánh giá công khai kiểu bài đăng (`ReviewCard`): avatar, tên, sao, thời gian, nội dung, **lưới ảnh bấm phóng to**, Hữu ích / Báo cáo. **Lỗi cũ**: trang quán đọc `review.revision.content` trong khi API trả `content` → nội dung đánh giá trước đây hiện trống; đã sửa |
| 56 | "Kinh độ / vĩ độ phức tạp, sinh viên và admin khó nhập" | Component **bản đồ chọn vị trí** (`LocationPickerMap`): tìm địa điểm / dán link Google Maps, **bấm lên bản đồ hoặc kéo ghim**, nút "Vị trí của tôi" (GPS), địa chỉ tra ngược hiện bên dưới. Dùng trong form sửa quán (ô kinh/vĩ độ chuyển vào mục "Nâng cao", form mới không còn toạ độ KHTN cài sẵn), form thêm cơ sở trường, form gợi ý quán của sinh viên. Chọn tên quán ở ô trên là ghim tự nhảy tới |
| 57 | "Khảo sát chủ yếu quanh ĐH FPT HCM và Làng đại học (NVH Sinh viên)" | `scripts/seed-campuses.mjs` thêm: ĐH FPT TP.HCM (Khu Công nghệ cao), Nhà Văn hóa Sinh viên (Làng đại học), Thư viện Trung tâm ĐHQG, ĐH Nông Lâm, ĐH SPKT, ĐH ANND → tổng 17 cơ sở (đã chạy dev; chạy prod khi deploy) |
| 58 | "Seed sẵn tất tần tật trường động một quán có thể có" | `scripts/seed-field-definitions.mjs`: **58 trường** trong 7 nhóm — Không gian & chỗ ngồi (11), Học tập & làm việc (11 + phòng học nhóm), Đồ uống & đồ ăn (8), Dịch vụ & thanh toán (8), Tiện nghi & đi lại (10), Liên hệ & mạng xã hội (6), Khảo sát nội bộ (4, **không công khai**). Trước đây form quán chỉ nhập được 1 trường REPEATER; nay tab **"Tiện ích chi tiết"** render mọi kiểu (Có/Không/Chưa rõ, chọn một/nhiều, số có đơn vị, tiền, ngày, giờ, link, đoạn văn, khoảng), nhóm theo fieldGroup, chỉ lưu ô có giá trị; trang quán hiện mục cùng tên (chỉ ô có dữ liệu, trường nội bộ tự ẩn); API công khai `GET /places/field-definitions`; trang admin "Trường động" viết lại (nhóm, công khai/nội bộ, lựa chọn, gắn danh mục, lưu trữ). **Lỗi tìm thấy khi tự kiểm**: ô nhập trường động không nhận giá trị vì component bọc không chuyển tiếp `value/onChange` từ `Form.Item` — đã sửa và kiểm lại (nhập → lưu → mở lại còn nguyên → trang công khai hiện đúng) |
| 59 | "Profile kiểu Facebook, ít tab, thiểu năng cũng dùng được" | Trang hồ sơ viết lại: ảnh bìa, avatar đè lên, tên + @username + vai trò, giới thiệu, trường, ngày tham gia, 4 số liệu; **4 tab**: Bài viết (dòng thời gian gộp đánh giá + bài viết, chính chủ thấy cả bài chờ duyệt/bị từ chối kèm ghi chú ban duyệt; ô "Bạn muốn chia sẻ quán nào?"), Ảnh (gom ảnh từ đánh giá + bài viết), Đã lưu (quán yêu thích + bộ sưu tập một trang, không tab con), Đóng góp (đề xuất quán / báo sửa / khảo sát / nhãn dán thành **một danh sách** lọc bằng nút, hết tab con). Người khác xem: 3 tab (Bài viết / Ảnh / Bộ sưu tập). Nút **Chỉnh sửa hồ sơ**: ảnh đại diện cắt tròn, tên, giới thiệu, trường (API mới `GET/PUT /me/profile`, `GET /me/timeline`; avatar công khai ngay, admin vẫn thu hồi được ở Thư viện ảnh). Link cũ `?tab=my-collections/favorites/reviews` vẫn dùng được |
| 60 | "Icon GIF gộp lại thay vì tách từng tab" | `StickerPicker`: mọi bộ nhãn dán trong **một khung cuộn** (tiêu đề bộ nhỏ, dính khi cuộn), ô tìm nhanh, dải nút nhảy tới bộ; không còn Tabs |
| 61 | Icon web / logo | `favicon.ico` (16+32), `favicon-16/32.png`, `apple-touch-icon.png`, `icon-192/512.png`, `site.webmanifest` sinh từ ảnh bạn đưa; logo bo góc hiện ở navbar + sidebar admin (link `/logo.svg` cũ trỏ vào file không tồn tại) |

Test tự động: thêm `apps/server/src/__tests__/profile-and-social.test.ts` (5 test: hồ sơ, đổi avatar → công khai ngay, chặn dùng ảnh người khác, đánh giá kèm ảnh chỉ công khai sau duyệt + hiện ở tab Ảnh, API trường động công khai không lộ trường nội bộ) → **130/130** (9 shared + 121 server).
| 62 | "Cho tải lên ảnh bìa nữa" | Nút "Tải/Đổi ảnh bìa" ở góc ảnh bìa hồ sơ (chính chủ): chọn ảnh → cắt ngang tỷ lệ 4:1 → tải lên → lưu; menu "Gỡ ảnh bìa". DB thêm cột `user_profiles.currentPublishedCoverAssetId` (migration `20260920120000_profile_cover_asset`, idempotent); `PUT /me/profile { coverAssetId }`; avatar + bìa công bố chung theo thực thể USER (đổi cái này không gỡ cái kia — có test) |
| 63 | "Thêm phân trang" (`/admin/media`) + "tab đánh giá có phân trang không?" | Thư viện ảnh admin: phân trang phía server (12/24/48 ảnh mỗi trang, hiện "1–24 / 32 ảnh"; đổi bộ lọc về trang 1). Trang quán: Đánh giá / Bài trải nghiệm / Bình luận phân trang tại chỗ 5 mục mỗi trang (chỉ hiện khi >5). Ảnh đơn trong thẻ giới hạn cao 360px thay vì chiếm cả màn hình |
| 64 | "Nhãn dán gộm lại một dòng, không hiện tên" | Bộ chọn nhãn dán: mọi nhãn của mọi bộ chung một lưới, hết dòng xuống dòng; không tên bộ / tên nhãn (rê chuột mới hiện); ô tìm chỉ xuất hiện khi >12 nhãn |

**Deploy 21/09 sáng:** `node scripts/deploy-vps.mjs` → migration `20260920120000_profile_cover_asset` áp lên prod; seed 6 cơ sở mới (FPT, NVH SV, Nông Lâm, SPKT, ANND, Thư viện TT) và 58 trường động lên prod bằng `scripts/seed-campuses.mjs` / `scripts/seed-field-definitions.mjs` (API công khai trả 55 trường). Smoke prod bằng Playwright (`docs/evidence/prod/11–15`): hồ sơ 4 tab, đổi ảnh bìa (ảnh công khai qua media gateway), mobile không tràn ngang, favicon mới, 0 lỗi API. **Prod hiện chưa có quán nào** (đã xoá dữ liệu theo yêu cầu 19/09) nên bước đánh giá có ảnh / editor chưa chạy được trên prod — đã kiểm trên dev (86/86).

### Đợt sửa 21/09 (sáng) — sinh viên tạo quán đầy đủ như admin; sửa lỗi 500 khi duyệt đề xuất trên prod

| # | Yêu cầu / lỗi | Đã làm |
|---|---|---|
| 65 | **Lỗi prod**: `POST /admin/community/suggestions/:id/moderate` → 500 | Nguyên nhân (log VPS): form gợi ý cũ gửi giá dạng chuỗi `"20000"`, bản duyệt đưa thẳng vào `PlacePublishedProjection.priceMin` (Float) → Prisma từ chối. Ngoài ra bản duyệt cũ **bịa mặc định**: Wi-Fi mạnh, máy lạnh có, "giảm 10%", giờ 07:00–22:30, điểm 5.0, toạ độ KHTN nếu thiếu. Viết lại: `buildSnapshotFromSuggestion()` dựng hồ sơ từ đúng dữ liệu sinh viên (ép kiểu số, lịch 7 ngày từ khung giờ, tiện ích không điền = Chưa rõ, ảnh chỉ nhận ảnh của chính người gửi, trường động tra định nghĩa để gắn id/phiên bản, ghi chú vào mô tả), qua Zod; điểm 0/0 đánh giá; dùng chung `syncPublishedProjection` + `syncPlaceAssetUsages` với luồng admin. Thiếu vị trí → **422** kèm lý do (không tạo quán với toạ độ giả); duyệt lại đề xuất đã duyệt → 409; gửi thông báo cho sinh viên khi duyệt/từ chối/yêu cầu bổ sung |
| 66 | Prod log spam `ECONNREFUSED 127.0.0.1:6380` | Hàng đợi BullMQ chỉ đọc `REDIS_HOST/PORT` (mặc định dev) → nay đọc `REDIS_URL` (prod `redis://ssg-redis:6379`) |
| 67 | "Cho sinh viên tạo quán như admin, dựa vào các trường có sẵn; có gì khác thì điền thêm" | `PlaceSuggestionForm` mới: một trang cuộn **7 mục** (Quán ở đâu → Giờ → Giá & ưu đãi → Tiện ích học tập → Tiện ích chi tiết (mọi trường động theo loại hình, gập theo nhóm) → Ảnh (cắt được) → Thông tin khác: mô tả, ĐT, website, **ghi chú tự do**), chỉ 4 ô bắt buộc (tên, loại hình, địa chỉ, vị trí). Modal 1040px, ô nhập cỡ lớn, bản đồ 320px. Lưu nháp / gửi duyệt; **sửa & gửi lại** đề xuất "Cần bổ sung" nạp sẵn dữ liệu cũ (PUT) |
| 68 | "Địa chỉ ghi vào ô địa chỉ rồi fetch; tên quán tự đặt; chọn trên bản đồ thì địa chỉ đổi theo" | Cả form sinh viên và form admin: **ô Địa chỉ** là ô tìm bản đồ (gõ địa chỉ / dán link Google Maps → chọn → vị trí + trường gần nhất tự điền), **Tên quán** là ô nhập tự do (slug tự sinh theo tên khi tạo quán mới), kéo ghim / bấm bản đồ / GPS → ô địa chỉ đổi theo địa chỉ tra ngược |
| 69 | Admin duyệt đề xuất | Modal duyệt viết lại: `GET /admin/community/suggestions/:id/preview` trả đúng hồ sơ sẽ tạo + danh sách thiếu sót; hiện vị trí (link Google Maps), giờ, giá, tiện ích, trường động, ảnh sinh viên gửi, ghi chú; nút Phê duyệt bị khoá khi thiếu dữ liệu, thêm nút **Yêu cầu bổ sung** |
| 70 | Trang quán | Hiện mô tả ngắn / mô tả đầy đủ của quán (trước đây snapshot có nhưng trang không hiển thị) |

Test tự động thêm `suggestion-approval.test.ts` (2 test: duyệt đề xuất đầy đủ → quán đúng dữ liệu, không bịa, ảnh công khai, projection 0 điểm, 409 duyệt lại; thiếu vị trí → 422 → yêu cầu bổ sung → sinh viên gửi lại kèm vị trí → duyệt được) → **132/132**. Kịch bản trình duyệt: bước "Gợi ý quán mới" điền đủ 7 mục, bước admin duyệt kiểm bản xem trước và snapshot quán tạo ra (tiện ích không điền = UNKNOWN, trường động 88 Mbps, 1 ảnh công khai).

**Deploy 21/09 10:46:** bản sửa duyệt đề xuất + form mới đã lên https://studymap.online (không có migration mới). Kiểm trên prod bằng API admin: 2 đề xuất đang chờ ("Phạm Văn Đồng", "Bamos cofffe") đều xem trước hợp lệ (giá `"20000"` chuỗi → 20000, có toạ độ); log server 2 phút gần nhất **0** dòng `ECONNREFUSED`. Chưa bấm duyệt hộ — nhóm tự duyệt trong "Duyệt đề xuất quán".

### Đợt sửa 21/09 (trưa) — form gợi ý responsive, bản đồ mở rộng, "không có trong danh sách", trang so sánh, lưới ảnh kiểu mạng xã hội

| # | Yêu cầu của bạn | Đã làm (kiểm bằng trình duyệt thật, desktop 1440×900 + iPhone 13) |
|---|---|---|
| 71 | "Form gợi ý đã dynamic theo trường động mới chưa? Nếu đúng thì sửa responsive + thân thiện hơn" | **Đúng** — form đọc `GET /places/field-definitions` (chỉ trường công khai, phiên bản hiện hành, lọc theo loại hình) nên admin thêm trường mới là form có ngay. Giao diện: 7 mục đánh số, **checklist ô bắt buộc** (chip xanh khi xong), footer dính đáy với nút "Gửi duyệt (thiếu N)", điện thoại: modal toàn màn hình, 1 cột, ô nhập cỡ vừa; desktop: 2 cột, ô lớn |
| 72 | "Lúc chọn vị trí trên mobile với desktop cho mở rộng OpenMap ra" | `LocationPickerMap` có nút **Mở rộng** → modal toàn màn hình với bản đồ thứ hai (kéo ghim / bấm / GPS đều đồng bộ về form), nút "Xong" đóng lại. Sửa lỗi bản đồ chỉ vẽ một phần khi khung đổi kích thước (ResizeObserver). Dùng ở form sinh viên, form admin, thêm cơ sở trường |
| 73 | "Lỡ quán / trường / cơ sở gần trường không có trong danh sách thì sao?" | Form gợi ý: **Loại hình khác** (ghi rõ) và **Trường khác** (ghi tên) — mục "khác" luôn có **nút cố định cuối bảng chọn** (`SelectWithOther`, không bị giấu bởi danh sách cuộn dài); gửi kèm `categoryOther/campusOther`. Admin thấy **cảnh báo** trong bản xem trước, chọn danh mục / cơ sở thay thế ngay trong modal duyệt (`approve-category`/`approve-campus`), tên sinh viên ghi được lưu vào nguồn dữ liệu của quán. Quán chưa có → nút "Đề xuất quán mới" ngay trong modal khảo sát / báo sửa |
| 74 | Sửa hồ sơ: "Trường / cơ sở đang học" cũng cần "khác" | Cột mới `user_profiles.customUniversityName` (migration `20260921090000`), `PUT /me/profile` nhận `customUniversityName` (loại trừ lẫn nhau với `universityCampusId`), hồ sơ công khai hiện tên trường tự ghi (tôn trọng "Ẩn trường"); modal có mục "Trường khác (tự ghi tên)" + nút "Trường của tôi không có trong danh sách" + ô tên. Test `profile-and-social` thêm case → **133/133** |
| 75 | `/collections/:id` responsive | Tiêu đề / tác giả / nút không còn xếp dọc từng chữ trên điện thoại (flex wrap), avatar tác giả, không tràn ngang |
| 76 | "Chỉnh sửa lại nguyên trang `/compare`" | Viết lại: bảng tiêu chí **cột đầu dính trái**, mỗi quán một cột cố định (280px desktop / 168px mobile, cuộn ngang), thẻ quán có ảnh 16:9 + Chi tiết + gỡ; nhóm **Tổng quan / Giờ mở cửa / Tiện ích học tập** + mọi nhóm trường động "cho phép so sánh"; ô **tốt nhất** trong hàng được tô xanh + dấu check (giá thấp hơn, Wi-Fi mạnh hơn, yên tĩnh hơn…); thêm quán bằng ô tìm; tối đa 4 quán |
| 77 | "Nhiều ảnh thì về dạng lưới như Facebook (+N mục khác), ở mọi chỗ trừ form tạo" | `components/media/PhotoGrid` dùng chung: 1 ảnh to / 2 chia đôi / 3 = 1 trên + 2 dưới / 4+ = 2×2 với ô cuối "+N mục khác"; bấm ảnh nào cũng mở trình xem toàn bộ. Áp dụng: thẻ đánh giá, thẻ bài viết, trang bài viết (trước đây không hiện ảnh bài), dòng thời gian hồ sơ, gallery trang quán |
| 78 | "Ảnh to quá, chia bố cục hợp lý lại" | Gallery quán trên desktop dùng biến thể **collage** (1 ảnh lớn trái + cột 3 ảnh phải, cao cố định 420px); điện thoại giữ lưới 2×2. Trang so sánh: ảnh quán tối đa 150px |

Kịch bản trình duyệt bổ sung: bước "Gợi ý quán mới" mở rộng bản đồ (kiểm khung bản đồ ≥ 300px) + chọn "Trường khác"; bước admin duyệt kiểm cảnh báo trường tự ghi, chọn cơ sở KHTN thay thế và xác nhận `snapshot.nearestCampusId` của quán tạo ra; bước "Sửa hồ sơ" chọn "Trường khác" và kiểm tên hiện trên hồ sơ; bước so sánh kiểm bảng mới; bước chi tiết quán kiểm gallery kiểu mạng xã hội → **86/86 PASS**, `pnpm test` **133/133**.

### Đợt sửa 22–24/09 — xoá/thu hồi nội dung, ảnh phải qua duyệt, bản đồ hiện vị trí, trang 404, trả lời bình luận, bot Zalo

| # | Yêu cầu của bạn | Đã làm (kiểm bằng trình duyệt thật + test tự động) |
|---|---|---|
| 79 | "Thiếu D ở nhiều model: đánh giá, bình luận, sinh viên tạo quán… không xoá hay thu hồi được" | Thêm đủ **xoá / thu hồi** cho chính chủ: `DELETE /places/reviews/:id` (+ `POST .../withdraw` thu hồi bản chờ duyệt), `DELETE /community/comments/:id` (xoá mềm, giữ chỗ "Bình luận đã bị xoá" khi còn câu trả lời), `DELETE /community/posts/:id` + `withdraw`, `DELETE /me/collections/:id`, `DELETE /me/contributions/{suggestions,survey-requests,change-requests}/:id` (chỉ khi chưa duyệt, đã duyệt → 409). Giao diện: menu “…” trên thẻ đánh giá / bài viết, nút Xoá ở bình luận, nút Thu hồi ở trang Đóng góp, nút Xoá ở bộ sưu tập và trang bài viết. Admin xoá được bình luận / bài của bất kỳ ai |
| 80 | "Ảnh upload là công khai luôn, không qua chờ duyệt" | Ảnh đại diện & ảnh bìa nay **vào hàng đợi duyệt**: chính chủ xem được ngay (preview, hồ sơ báo "đang chờ duyệt"), người khác nhận **403** cho tới khi admin duyệt; hồ sơ công khai chưa hiện ảnh. Ảnh do **admin** tải lên được duyệt sẵn (admin chính là người duyệt). Thêm **duyệt hàng loạt** (`POST /media/admin/moderate-bulk` + nút "Duyệt hết trang này"); khi phê duyệt không bắt buộc nhập lý do (chỉ bắt khi từ chối / thu hồi) |
| 81 | "Duyệt icon / emoji / GIF lại phải qua phần duyệt ảnh — khá sai" | Hàng đợi Thư viện ảnh mặc định **bỏ ảnh của bộ nhãn dán** (thêm bộ lọc *Ảnh nội dung / Ảnh nhãn dán / Tất cả*); duyệt **bộ nhãn dán** là ảnh trong bộ tự chuyển APPROVED và công khai ngay — không phải duyệt hai lần. Badge "Thư viện ảnh" cũng không đếm ảnh nhãn dán nữa |
| 82 | "Không thể xoá ảnh" | `DELETE /media/:assetId`: chủ ảnh xoá ảnh của mình (chặn 409 nếu ảnh đang nằm trong nội dung đã duyệt), admin xoá bất kỳ ảnh nào; xoá cả **file trên ổ đĩa** (bản gốc cách ly + mọi phiên bản + variant) và gỡ liên kết ảnh đại diện / ảnh bìa. Nút Xoá có ở trang Thư viện ảnh và trong hộp Kho ảnh |
| 83 | "Form gắn ảnh vào quán: chọn từ kho ảnh không hiện gì" | Nguyên nhân: hộp kho ảnh chỉ đọc `/media/my` (ảnh của **chính tài khoản đang đăng nhập**) nên admin chưa tải ảnh nào thì trống trơn. Nay admin mặc định xem **toàn bộ kho** (`/media/admin/list`), có nút chuyển "Ảnh tôi tải", lọc theo trạng thái, và xoá ảnh ngay trong hộp |
| 84 | "Thêm UI hiển thị vị trí hiện tại của user trên bản đồ" | Bấm "Vị trí của tôi" → **chấm xanh** + vòng tròn sai số GPS + thẻ hiện toạ độ (±m) và nút ẩn; bấm lại là bay về vị trí đó. Từ chối quyền định vị vẫn mở hộp chọn cơ sở trường như cũ |
| 85 | "Bổ sung trang 404 cho quán khi user bấm vào" | Trang 404 dùng chung: ô tìm quán, nút về Khám phá / Bản đồ / Đề xuất quán mới. Dùng cho quán không tồn tại, bài viết bị gỡ và **mọi đường dẫn sai** (trước đây đá thẳng về trang chủ) |
| 86 | "Cho trả lời bình luận của người khác" | Bình luận đổi sang **dạng cây**: câu trả lời lồng dưới bình luận gốc (thụt lề, avatar nhỏ), nút Trả lời / Xoá / Báo cáo theo quyền, phân trang theo bình luận gốc. Xoá bình luận còn câu trả lời thì giữ chỗ "Bình luận đã bị xoá"; xoá hết trả lời thì biến mất hẳn. Bình luận đã xoá không còn nằm trong hàng đợi duyệt của admin |
| 87 | "Chat với AI không xoá được chat cũ" | Khung chat thêm nút **lịch sử hội thoại**: chọn lại hội thoại cũ, xoá từng hội thoại hoặc **xoá tất cả** (API `DELETE /ai/conversations/:id` đã có sẵn, trước đây giao diện không gọi tới) |
| 88 | "Bot Zalo thông báo khi có yêu cầu duyệt, vẫn phải cấu hình động" | Trang **Quản trị → Thông báo Zalo**: thêm nhiều kênh, token mã hoá AES-256-GCM (giao diện chỉ hiện dạng che), chọn **10 loại sự kiện** (đề xuất quán / đánh giá / bình luận / bài viết / bộ sưu tập / nhãn dán / ảnh / báo cáo / hỗ trợ / khảo sát), đặt mức gộp tin theo phút, nút **Kiểm tra token** (getMe), **Đọc tin nhắn gần nhất** để lấy `chat_id`, **Gửi thử**, và trạng thái lần gửi gần nhất. Server bắn tin qua `https://bot-api.zaloplatforms.com/bot{token}/sendMessage` ngay khi có việc mới, lỗi Zalo không bao giờ làm hỏng luồng nghiệp vụ |

Bổ sung kiểm thử: bộ test mới `delete-moderation-and-zalo.test.ts` (7 nhóm: xoá đánh giá, xoá bình luận có/không câu trả lời, thu hồi bài & đề xuất, ảnh đại diện phải duyệt, ảnh admin tự duyệt + tách ảnh nhãn dán + xoá ảnh, duyệt hàng loạt, kênh Zalo với API giả lập) → **140/140** (9 shared + 131 server). Kịch bản trình duyệt thêm 9 bước (trang 404, chấm vị trí bản đồ, bình luận dạng cây + xoá, thu hồi đóng góp, lịch sử chat, thư viện ảnh lọc nguồn + duyệt cả trang, kênh Zalo, ảnh đại diện chờ duyệt, chính chủ xoá đánh giá) → **95/95 PASS**.

### Đợt 29/09 — ghép bản giao diện mới của nhóm + ẩn/xoá quán & rà quán trùng

| # | Việc | Đã làm |
|---|---|---|
| 89 | Ghép source bạn trong nhóm gửi (`StudyMap_Source_Code.zip`, 25–26/09) | So khớp từng file với repo: bản đó dựng trên code ngày 24/09 nên **giữ nguyên toàn bộ** bản vá của đợt trước (chặn ảnh chưa duyệt, `SafeAvatar`, bình luận dạng cây, xoá/thu hồi, rate-limit). Đã lấy phần **giao diện**: đổi bảng màu xanh → **nâu cà phê** (`#6F4E37`), đổi tên hiển thị thành **StudyMap**, viết lại trang Khám phá / trang quán / bản đồ / navbar, thêm `StudyOmnibox` (ô tìm kiếm gợi ý), `StudyAtmosphereMeter`, `PlaceCardSkeleton`, `utils/openStatus.ts`. Đồng bộ thêm `index.html` + `site.webmanifest` (tiêu đề, theme-color, biến CSS) theo tông mới |
| 90 | **Bỏ phần dữ liệu ảo** trong bản gửi | Bản đó có `mock-places.data.ts` (3 quán ảo + ảnh Unsplash) và cho API trả dữ liệu ảo khi DB lỗi **hoặc khi truy vấn không ra kết quả** — tức người dùng lọc không trúng quán nào là site hiện quán không có thật. Theo yêu cầu "cấm bịa", **không đưa phần này vào repo**; server giữ nguyên hành vi cũ (trả đúng dữ liệu thật, lỗi thì báo lỗi) |
| 91 | Thiếu **ẩn quán** | `POST /admin/places/:id/visibility` — ẩn = xoá bản chiếu công khai: quán biến mất khỏi danh sách, tìm kiếm, bản đồ, so sánh và trang chi tiết trả **404**; dữ liệu + lịch sử phiên bản vẫn còn, bấm **Hiện lại** là khôi phục đầy đủ (kèm ảnh). Nút Ẩn / Hiện lại nằm ngay hàng quán ở trang Quản lý địa điểm |
| 92 | Thiếu **xoá quán** | `DELETE /admin/places/:id?confirm=<slug>` — xoá kèm phiên bản, đánh giá, lượt lưu; ảnh bị gỡ công khai (ảnh vẫn nằm trong kho). Giao diện bắt **gõ đúng đường dẫn quán** mới cho xoá, kèm cảnh báo không khôi phục được và gợi ý dùng "Ẩn" nếu chỉ muốn tạm gỡ |
| 93 | **Quán trùng** | `GET /admin/places/duplicates` gom nhóm theo **tên đã bỏ dấu** hoặc **vị trí cách nhau dưới 60 m**; nút "Tìm quán trùng" mở bảng từng nhóm, mỗi quán kèm địa chỉ / số đánh giá / ngày tạo / đang hiện hay ẩn và nút Ẩn – Xoá ngay tại chỗ |

Kiểm thử: thêm ca `6b` trong `delete-moderation-and-zalo.test.ts` (ẩn → 404 & mất khỏi danh sách, hiện lại → 200, tạo bản sao → rà trùng thấy nhóm, xoá thiếu xác nhận → 422, xoá đúng slug → 200, sinh viên gọi → 403) và 1 bước crawl mới (ẩn/hiện lại quán thật + mở bảng quán trùng + hộp xoá yêu cầu gõ slug).

### Đợt 29/09 (chiều) — biến khối "Dữ liệu học bài" thành dữ liệu thật + thêm trường nhập

Bản giao diện mới hiển thị nhiều khối thông tin hấp dẫn nhưng **nội dung là chữ cứng trong code**: bàn cao 75cm, ghế có tựa lưng, nước lọc miễn phí, máy lạnh 24/7, biểu đồ giờ cao điểm cố định cho mọi quán, mật khẩu Wi-Fi mặc định `studymap2026`, và "12 lượt xác nhận còn bàn" chỉ lưu trong trình duyệt của từng người. Đợt này chuyển toàn bộ sang dữ liệu thật:

| # | Việc | Đã làm |
|---|---|---|
| 94 | Thêm **12 trường động mới** để quán có chỗ nhập các thông tin này | Nhóm **Bàn ghế & công thái học**: chiều cao bàn (cm), bàn phù hợp laptop, ghế có tựa lưng, đèn bàn, khoảng cách giữa các bàn, số giờ ngồi thoải mái. Nhóm **Giờ đông khách theo khung**: 5 khung Sáng / Trưa / Chiều / Tối / Khuya (Vắng → Rất đông / Đóng cửa). Nhóm **Wi-Fi & ổ cắm**: mật khẩu Wi-Fi. Seed bằng `scripts/seed-study-comfort-fields.mjs` (idempotent), tự gắn vào mọi danh mục nên **form admin và form sinh viên hiện ngay** |
| 95 | Khối **Công thái học** | Dựng từ giá trị thật của quán (chiều cao bàn, ghế, đèn, ánh sáng, khoảng cách bàn, gửi xe, nước miễn phí, máy lạnh, đồ ăn, ổ cắm, nhà vệ sinh…). Quán chưa có gì → hiện ô **"Quán chưa có thông tin… Bổ sung thông tin giúp các bạn khác"** mở thẳng hộp đóng góp. Nhãn "✓ Đã kiểm chứng thực tế" đổi thành "Theo thông tin quán đã được duyệt" cho đúng sự thật |
| 96 | **Biểu đồ giờ đông khách** | Cột vẽ theo 5 trường `crowd_*` thật; chưa nhập thì cột xám và hiện "Quán chưa có dữ liệu giờ đông khách — góp thông tin giúp các bạn khác". Nhãn "🔥 Cao điểm 14h-18h" và cảnh báo giờ cao điểm nay lấy đúng khung giờ đông nhất của từng quán |
| 97 | **Mật khẩu Wi-Fi** | Lấy từ trường `wifi_password` của quán; chưa có thì hiện "Hỏi nhân viên tại quán" và nút sao chép báo rõ thay vì chép một mật khẩu bịa |
| 98 | **"Quán còn bàn không?"** | Làm thật ở máy chủ: bảng `place_seat_reports` (migration `20260929120000`), `GET /places/:id/seat-status` tổng hợp **2 giờ gần nhất** (số lượt từng mức, mức nhiều lượt nhất, thời điểm báo gần nhất), `POST` cần đăng nhập và **mỗi người 15 phút một lần** để không ai bấm nhiều lần làm lệch số liệu. Chưa ai báo → hiện "Chưa rõ / chưa có ai báo" |

Kiểm thử: thêm ca `6c` (chưa ai báo → rỗng; khách → 401; báo lần đầu → 201; bấm lại ngay → 429; người thứ hai → cộng dồn; báo cũ hơn 2 giờ không tính) và 1 bước crawl (bấm "Gần hết bàn" rồi kiểm tổng hợp trên máy chủ + biểu đồ giờ đông khách).
