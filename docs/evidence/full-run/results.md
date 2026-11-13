# Kết quả chạy toàn bộ tính năng — 2026-09-29T05:15:17.300Z

**97/97 bước PASS.** Ảnh chụp trong `docs/evidence/full-run/`.

| # | Nhóm | Bước | Kết quả | Lỗi | Lỗi API (4xx/5xx) | Console | Ảnh |
|---|---|---|---|---|---|---|---|
| 1 | Khách | Trang khám phá (danh sách + bản đồ) | ✅ |  |  | 0 | 01-guest-discover.png |
| 2 | Khách | Tìm kiếm tiếng Việt không dấu | ✅ |  |  | 0 | 02-guest-search.png |
| 3 | Khách | Bộ lọc Không gian / Tiện ích | ✅ |  |  | 0 | 03-guest-filter-space.png |
| 4 | Khách | Bản đồ trang chủ: phóng to rồi thu nhỏ -> danh sách tải lại theo khung nhìn | ✅ |  |  | 0 | 04-guest-map-zoom-refetch.png |
| 5 | Khách | Bản đồ: nhãn Hoàng Sa / Trường Sa / Biển Đông hiện khi thu nhỏ, không còn "South China Sea" | ✅ |  |  | 0 | 05-guest-map-islands.png |
| 6 | Khách | Trang bản đồ riêng | ✅ |  |  | 0 | 06-guest-map.png |
| 7 | Khách | Chi tiết quán (gallery, giờ mở cửa, tiện ích) | ✅ |  |  | 0 | 07-guest-place-detail.png |
| 8 | Khách | Tab Đánh giá / Bài trải nghiệm / Hỏi đáp | ✅ |  |  | 0 | 08-guest-place-tabs.png |
| 9 | Khách | Trang 404: quán không tồn tại và đường dẫn sai đều có lối thoát (tìm quán / bản đồ) | ✅ |  | 404 GET /api/v1/places/khong-co-quan-nay-539496<br>404 GET /api/v1/places/khong-co-quan-nay-539496 | 4 | 09-guest-404.png |
| 10 | Khách | Bản đồ: nút "Vị trí của tôi" cắm chấm xanh + hiện toạ độ hiện tại | ✅ |  |  | 0 | 10-guest-map-my-location.png |
| 11 | Khách | So sánh quán (trống + hướng dẫn) | ✅ |  |  | 0 | 11-guest-compare-empty.png |
| 12 | Khách | So sánh 2 quán (bảng đối chiếu Wi-Fi/ổ cắm/giá) | ✅ |  |  | 0 | 12-guest-compare-two.png |
| 13 | Khách | Trang đăng nhập | ✅ |  |  | 0 | 13-guest-login.png |
| 14 | Khách | Trang đăng ký | ✅ |  |  | 0 | 14-guest-register.png |
| 15 | Khách | Trang quên mật khẩu | ✅ |  |  | 0 | 15-guest-forgot.png |
| 16 | Khách | Khách không vào được /admin | ✅ |  |  | 0 | 16-guest-admin-blocked.png |
| 17 | Khách | Chat AI yêu cầu đăng nhập | ✅ |  |  | 1 | 17-guest-chat-requires-login.png |
| 18 | Tài khoản | Đăng ký tài khoản mới | ✅ |  |  | 1 | 18-register-submitted.png |
| 19 | Tài khoản | Email xác minh gửi tới Mailpit | ✅ |  |  | 0 | 19-email-verified.png |
| 20 | Tài khoản | Đăng nhập tài khoản mới | ✅ |  |  | 1 | 20-new-user-logged-in.png |
| 21 | Tài khoản | Quên mật khẩu gửi email | ✅ |  |  | 1 | 21-forgot-password-sent.png |
| 22 | Sinh viên | Đăng nhập & về trang khám phá | ✅ |  |  | 0 | 22-student-home.png |
| 23 | Sinh viên | Yêu thích quán (toggle) | ✅ |  |  | 1 | 23-student-favorite.png |
| 24 | Sinh viên | Chi tiết quán: Viết đánh giá | ✅ |  |  | 2 | 24-student-write-review.png |
| 25 | Sinh viên | Chi tiết quán: Gửi bình luận | ✅ |  |  | 0 | 25-student-comment.png |
| 26 | Sinh viên | Chi tiết quán: Báo cáo vi phạm (chọn lý do + mô tả + gửi) | ✅ |  |  | 1 | 26-student-report-submit.png |
| 27 | Sinh viên | Chi tiết quán: Viết bài trải nghiệm | ✅ |  |  | 1 | 27-student-post.png |
| 28 | Sinh viên | Báo sửa thông tin / đóng góp cho quán | ✅ |  |  | 0 | 28-student-contribution-modal.png |
| 29 | Sinh viên | Khối học bài: báo "quán còn bàn không" và xem giờ đông khách theo dữ liệu thật | ✅ |  |  | 1 | 29-student-seat-report.png |
| 30 | Sinh viên | Bình luận dạng cây: trả lời bình luận của mình rồi xoá (bình luận gốc còn chỗ "đã bị xoá") | ✅ |  |  | 1 | 30-student-comment-thread-delete.png |
| 31 | Sinh viên | Gợi ý quán mới: form đầy đủ như admin (chọn từ bản đồ, giờ, giá, tiện ích, trường động, ảnh, ghi chú) | ✅ |  |  | 3 | 31-student-suggest-place.png |
| 32 | Sinh viên | Thu hồi đóng góp chưa duyệt ngay trên trang Đóng góp | ✅ |  |  | 2 | 32-student-withdraw-contribution.png |
| 33 | Sinh viên | Chat AI: xem lại hội thoại cũ và xoá hội thoại | ✅ |  |  | 1 | 33-student-chat-history-delete.png |
| 34 | Sinh viên | Hồ sơ (kiểu mạng xã hội): /me/contributions chuyển về tab "Đóng góp" — một danh sách, lọc bằng nút | ✅ |  |  | 1 | 34-student-my-contributions.png |
| 35 | Sinh viên | Gửi bộ nhãn dán (tải ảnh + đặt tên + gửi duyệt) | ✅ |  |  | 1 | 35-student-sticker-submit.png |
| 36 | Sinh viên | Bộ sưu tập: tạo mới | ✅ |  |  | 3 | 36-student-collection-create.png |
| 37 | Sinh viên | Lưu quán vào bộ sưu tập (từ trang quán) | ✅ |  |  | 2 | 37-student-save-to-collection.png |
| 38 | Sinh viên | Trang bộ sưu tập: hiện đúng quán vừa lưu (tên, ảnh, địa chỉ) + nút gỡ | ✅ |  |  | 0 | 38-student-collection-detail.png |
| 39 | Sinh viên | Tab Đã lưu: quán yêu thích + bộ sưu tập cùng một trang (không Invalid Date) | ✅ |  |  | 2 | 39-student-favorites-tab.png |
| 40 | Sinh viên | Thông báo: trang danh sách | ✅ |  |  | 1 | 40-student-notifications.png |
| 41 | Sinh viên | Thông báo: popover chuông | ✅ |  |  | 1 | 41-student-notification-popover.png |
| 42 | Sinh viên | Hồ sơ kiểu mạng xã hội: ảnh bìa, avatar, 4 tab (Bài viết / Ảnh / Đã lưu / Đóng góp), bài chờ duyệt có ảnh | ✅ |  |  | 1 | 42-student-public-profile.png |
| 43 | Sinh viên | Sửa hồ sơ: đổi ảnh đại diện (cắt tròn) + giới thiệu -> hiện ngay trên hồ sơ và thanh menu | ✅ |  |  | 1 | 43-student-profile-edit.png |
| 44 | Sinh viên | Ảnh bìa hồ sơ: tải lên + cắt ngang -> hiện ngay, khách xem được | ✅ |  |  | 0 | 44-student-profile-cover.png |
| 45 | Sinh viên | Tab Ảnh của hồ sơ: gom ảnh từ đánh giá + bài viết | ✅ |  |  | 1 | 45-student-profile-photos.png |
| 46 | Sinh viên | Chat AI: hội thoại mới + đồng ý quyền riêng tư + gửi câu hỏi + nhận trả lời (DeepSeek thật) | ✅ |  |  | 1 | 46-student-chat-answer.png |
| 47 | Sinh viên | Hạn mức AI/ngày: vượt mức thì bị chặn 429 kèm thông báo | ✅ |  |  | 2 | 47-student-ai-quota-blocked.png |
| 48 | Sinh viên | Chat AI: yêu cầu admin hỗ trợ | ✅ |  |  | 0 | 48-student-chat-request-human.png |
| 49 | Sinh viên | Sinh viên không vào được /admin | ✅ |  |  | 0 | 49-student-admin-blocked.png |
| 50 | Admin | Tổng quan hệ thống (badge pending, thống kê) | ✅ |  |  | 1 | 50-admin-dashboard.png |
| 51 | Admin | Quản lý địa điểm: danh sách | ✅ |  |  | 0 | 51-admin-places.png |
| 52 | Admin | Thêm quán: tên tự đặt; gõ địa chỉ -> chọn từ bản đồ -> toạ độ + cơ sở trường tự điền | ✅ |  |  | 1 | 52-admin-place-geocode-pick.png |
| 53 | Admin | Quản lý địa điểm: mở form sửa (nạp đúng dữ liệu mới nhất) | ✅ |  |  | 0 | 53-admin-place-editor.png |
| 54 | Admin | Form sửa: tab Hình ảnh (ảnh đã gắn hiện đúng) | ✅ |  |  | 0 | 54-admin-place-editor-media.png |
| 55 | Admin | Form sửa: tab Tiện ích chi tiết (trường động seed: nhóm Không gian / Học tập / Đồ uống / Dịch vụ / Tiện nghi / Liên hệ) | ✅ |  |  | 0 | 55-admin-place-editor-dynamic.png |
| 56 | Admin | Form sửa: Lưu & Xuất Bản Ngay | ✅ |  |  | 1 | 56-admin-place-publish-now.png |
| 57 | Admin | Duyệt đề xuất quán (hàng đợi đóng góp) | ✅ |  |  | 0 | 57-admin-contributions.png |
| 58 | Admin | Duyệt đề xuất: phê duyệt đề xuất mới nhất | ✅ |  |  | 2 | 58-admin-contribution-approved.png |
| 59 | Admin | Ẩn quán khỏi trang công khai rồi hiện lại; rà soát quán trùng | ✅ |  |  | 1 | 59-admin-place-hide-duplicates.png |
| 60 | Admin | Thư viện ảnh: tách ảnh nhãn dán, duyệt cả trang một lượt, xoá ảnh khỏi kho | ✅ |  |  | 1 | 60-admin-media-queue.png |
| 61 | Admin | Thông báo Zalo: thêm kênh (token mã hoá), hiện trong bảng rồi xoá | ✅ |  |  | 2 | 61-admin-zalo-channel.png |
| 62 | Admin | Kiểm duyệt đánh giá / bình luận / bài / bộ sưu tập (4 tab) | ✅ |  |  | 0 | 62-admin-reviews.png |
| 63 | Admin | Kiểm duyệt: duyệt đánh giá chờ | ✅ |  |  | 1 | 63-admin-review-approved.png |
| 64 | Admin | Kiểm duyệt: tab bình luận + duyệt bình luận chờ | ✅ |  |  | 0 | 64-admin-comment-approved.png |
| 65 | Admin | Kiểm duyệt: tab bài trải nghiệm + duyệt bài chờ | ✅ |  |  | 0 | 65-admin-post-approved.png |
| 66 | Admin | Kiểm duyệt: tab bộ sưu tập | ✅ |  |  | 0 | 66-admin-reviews-tab-collections.png |
| 67 | Admin | Báo cáo vi phạm: mở báo cáo mới + Xác nhận & Giải quyết | ✅ |  |  | 1 | 67-admin-report-resolved.png |
| 68 | Admin | Báo cáo vi phạm (hàng đợi) | ✅ |  |  | 0 | 68-admin-reports.png |
| 69 | Admin | Duyệt bộ nhãn dán: xem ảnh + Phê Duyệt Phát Hành | ✅ |  |  | 1 | 69-admin-sticker-approved.png |
| 70 | Admin | Cơ sở trường & danh mục: danh sách từ DB + thêm cơ sở mới bằng tìm trên bản đồ | ✅ |  |  | 2 | 70-admin-reference-campus-added.png |
| 71 | Admin | Thông tin động: tạo trường động mới (v1) | ✅ |  |  | 1 | 71-admin-dynamic-field-created.png |
| 72 | Admin | Quản lý media (ảnh hiện, duyệt/thu hồi) | ✅ |  |  | 0 | 72-admin-media.png |
| 73 | Admin | Thông báo hệ thống (announcement) + tạo mới | ✅ |  |  | 1 | 73-admin-announcement-create.png |
| 74 | Admin | Hỗ trợ sinh viên (ticket từ chat) | ✅ |  |  | 0 | 74-admin-support.png |
| 75 | Admin | Hỗ trợ: mở ticket + trả lời | ✅ |  |  | 2 | 75-admin-support-reply.png |
| 76 | Admin | Nhật ký hệ thống (audit log) | ✅ |  |  | 0 | 76-admin-audit-logs.png |
| 77 | Admin | Quản lý người dùng | ✅ |  |  | 0 | 77-admin-users.png |
| 78 | Admin | Cấu hình AI: nhà cung cấp & model | ✅ |  |  | 1 | 78-admin-ai-providers.png |
| 79 | Admin | Cấu hình AI: tác vụ & phiên bản prompt | ✅ |  |  | 0 | 79-admin-ai-task-config.png |
| 80 | Admin | Cấu hình AI: giám sát hội thoại | ✅ |  |  | 0 | 80-admin-ai-conversations.png |
| 81 | Công khai sau duyệt | Đánh giá đã duyệt hiện trên trang quán dạng thẻ (avatar, sao, nội dung, ảnh) + điểm cập nhật | ✅ |  |  | 0 | 81-public-review-visible.png |
| 82 | Công khai sau duyệt | Trang quán: mục Tiện ích chi tiết hiện đúng nhóm + giá trị admin vừa nhập | ✅ |  |  | 0 | 82-public-dynamic-fields.png |
| 83 | Công khai sau duyệt | Bài trải nghiệm đã duyệt: mở trang chi tiết bài viết | ✅ |  |  | 0 | 83-public-post-detail.png |
| 84 | Công khai sau duyệt | Hồ sơ công khai: KHÔNG lộ đánh giá đang chờ duyệt | ✅ |  |  | 1 | 84-public-profile-no-pending-leak.png |
| 85 | Công khai sau duyệt | Nhãn dán đã duyệt xuất hiện trong bộ chọn (API public) | ✅ |  |  | 0 | 85-public-sticker-available.png |
| 86 | Công khai sau duyệt | Bình luận đã duyệt hiện với người khác | ✅ |  |  | 0 | 86-public-comment-visible.png |
| 87 | Công khai sau duyệt | Banner thông báo hệ thống hiện trên trang chủ | ✅ |  |  | 0 | 87-public-announcement-banner.png |
| 88 | Công khai sau duyệt | Sinh viên 2 không đọc được đóng góp/bộ sưu tập riêng của sinh viên 1 (IDOR) | ✅ |  |  | 0 | 88-public-idor-check.png |
| 89 | Sinh viên | Ảnh đại diện vừa đổi: hồ sơ báo "đang chờ duyệt" hoặc đã được duyệt xong | ✅ |  |  | 1 | 89-student-avatar-pending-state.png |
| 90 | Sinh viên | Xoá đánh giá của chính mình trên trang quán -> điểm quán tính lại | ✅ |  |  | 1 | 90-student-delete-own-review.png |
| 91 | Mobile | Mobile: khám phá | ✅ |  |  | 0 | 91-mobile-discover.png |
| 92 | Mobile | Mobile: bản đồ | ✅ |  |  | 0 | 92-mobile-map.png |
| 93 | Mobile | Mobile: chi tiết quán | ✅ |  |  | 0 | 93-mobile-place-detail.png |
| 94 | Mobile | Mobile: hồ sơ (kiểu mạng xã hội) | ✅ |  |  | 2 | 94-mobile-profile.png |
| 95 | Mobile | Mobile: hồ sơ cá nhân tab Đóng góp (không tràn ngang) | ✅ |  |  | 1 | 95-mobile-profile-contributions.png |
| 96 | Mobile | Mobile: thông báo | ✅ |  |  | 1 | 96-mobile-notifications.png |
| 97 | Mobile | Mobile: chat AI toàn màn hình | ✅ |  |  | 1 | 97-mobile-chat.png |