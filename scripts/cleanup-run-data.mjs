// Dọn dữ liệu do scripts/full-feature-run.mjs tạo trong DB dev (theo mã RUN 6 chữ số in trong tên/nội dung).
// Cách chạy: node scripts/cleanup-run-data.mjs <RUN>   hoặc   node scripts/cleanup-run-data.mjs --all-test
import { execFileSync } from 'node:child_process';

const arg = process.argv[2];
if (!arg) { console.error('usage: node scripts/cleanup-run-data.mjs <RUN|--all-test>'); process.exit(2); }
const like = arg === '--all-test' ? '%' : `%${arg}%`;

const sql = `
BEGIN;
DELETE FROM place_suggestions WHERE "proposedName" LIKE 'Trà Sữa Học Bài ${like}';
DELETE FROM places WHERE slug LIKE 'tra-sua-hoc-bai-${arg === '--all-test' ? '%' : arg + '%'}';
DELETE FROM reviews WHERE id IN (SELECT "reviewId" FROM review_revisions WHERE content LIKE '%review test ${like}');
DELETE FROM comments WHERE id IN (SELECT "commentId" FROM comment_revisions WHERE content LIKE '%(test ${like})%');
DELETE FROM posts WHERE id IN (SELECT "postId" FROM post_revisions WHERE title LIKE '%(${like})%');
DELETE FROM collections WHERE id IN (SELECT "collectionId" FROM collection_revisions WHERE name LIKE 'Quán học đêm ${like}');
DELETE FROM announcements WHERE title LIKE 'Thông báo test ${like}';
DELETE FROM users WHERE email LIKE 'sv_test_${like}@hcmus.edu.vn';
-- Hội thoại chat AI + ticket hỗ trợ do script tạo (câu hỏi có mã RUN); support_cases xoá theo cascade
DELETE FROM ai_conversations WHERE id IN (SELECT "conversationId" FROM ai_messages WHERE role = 'USER' AND content LIKE '%[test ${like}]%');
-- Báo cáo vi phạm test
DELETE FROM reports WHERE description LIKE '%(test ${like})%';
-- Cơ sở trường test
DELETE FROM campuses WHERE name LIKE 'Cơ sở test ${like}';
-- Bộ nhãn dán test (sticker_items xoá theo cascade)
DELETE FROM sticker_packs WHERE name LIKE 'Nhãn dán test ${like}';
-- Trường động test (versions xoá theo cascade)
DELETE FROM field_definitions WHERE key LIKE 'test_field_${arg === '--all-test' ? '%' : arg}';
-- Hồ sơ sinh viên 1: bỏ ảnh đại diện / ảnh bìa test, trả giới thiệu về seed (bước "Sửa hồ sơ" gắn mã RUN vào giới thiệu)
UPDATE user_profiles SET "currentPublishedAvatarAssetId" = NULL, "currentPublishedCoverAssetId" = NULL, "customUniversityName" = NULL, "currentPublishedBio" = 'Sinh viên năm 3 Khoa Công nghệ Thông tin HCMUS.'
WHERE "userId" IN (SELECT id FROM users WHERE email = 'sinhvien1@hcmus.edu.vn') AND "currentPublishedBio" LIKE '%(${like})%';
-- Trường động "Tiện ích chi tiết" nhập trong lần chạy (bus_routes có mã RUN) trên quán seed: gỡ 4 giá trị test khỏi snapshot
UPDATE place_revisions SET "snapshotData" = jsonb_set("snapshotData", '{dynamicFieldValues}',
  COALESCE((SELECT jsonb_agg(v) FROM jsonb_array_elements("snapshotData"->'dynamicFieldValues') v WHERE NOT (v->>'fieldKey' IN ('bus_routes','wifi_speed_mbps','has_whiteboard','restroom_quality'))), '[]'::jsonb))
WHERE "placeId" IN (SELECT id FROM places WHERE slug = 'ca-phe-hoc-bai-cu-dem-24-7') AND "snapshotData"::text LIKE '%08, 19 (${like})%';
-- Trả địa chỉ quán seed về giá trị gốc (bước "Lưu & Xuất Bản Ngay" có gắn mã RUN vào địa chỉ)
UPDATE place_revisions SET "snapshotData" = jsonb_set("snapshotData", '{address}', '"183 Trần Bình Trọng, Phường 3, Quận 5, TP.HCM"')
WHERE "placeId" IN (SELECT id FROM places WHERE slug = 'ca-phe-hoc-bai-cu-dem-24-7') AND "snapshotData"->>'address' LIKE '%(cập nhật %';
-- Bình luận / đề xuất / kênh Zalo test của đợt 22/09 (bước bình luận dạng cây, thu hồi đóng góp, kênh Zalo)
DELETE FROM comments WHERE id IN (SELECT c.id FROM comments c JOIN comment_revisions r ON r."commentId" = c.id
  WHERE r.content LIKE '%${like}%' AND (r.content LIKE 'Bình luận gốc%' OR r.content LIKE 'Trả lời%'));
DELETE FROM place_suggestions WHERE "proposedName" LIKE 'Quán thu hồi thử ${like}';
DELETE FROM notification_channels WHERE name LIKE 'Nhóm kiểm thử ${like}';
-- Báo cáo "còn bàn không" do bước kiểm thử tạo ra
DELETE FROM place_seat_reports WHERE "userId" IN (SELECT id FROM users WHERE email IN ('sinhvien1@hcmus.edu.vn', 'sinhvien2@hcmus.edu.vn'));
-- Tính lại điểm tổng hợp sau khi xoá review test
UPDATE place_published_projections p SET "reviewCount" = s.cnt, "ratingOverall" = COALESCE(s.avg, 0)
FROM (SELECT pl.id AS pid, count(rr.id) AS cnt, round(avg(rr."ratingOverall")::numeric, 1) AS avg
      FROM places pl
      LEFT JOIN reviews r ON r."placeId" = pl.id AND r.state = 'PUBLISHED'
      LEFT JOIN review_revisions rr ON rr.id = r."currentPublishedRevisionId" AND rr."moderationStatus" = 'APPROVED'
      GROUP BY pl.id) s
WHERE p."placeId" = s.pid;
COMMIT;
`;
const out = execFileSync('docker', ['exec', '-i', 'ssg-postgres', 'psql', '-U', 'ssg_admin', '-d', 'ssg_db', '-v', 'ON_ERROR_STOP=1'], { input: sql }).toString();
console.log(out.trim().split('\n').filter((l) => /^(DELETE|UPDATE|BEGIN|COMMIT)/.test(l)).join(' | '));
