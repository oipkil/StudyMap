-- Trường / cơ sở đang học không có trong danh sách -> sinh viên tự ghi tên
ALTER TABLE "user_profiles" ADD COLUMN IF NOT EXISTS "customUniversityName" TEXT;
