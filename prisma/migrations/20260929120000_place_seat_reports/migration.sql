-- Báo cáo nhanh "quán còn bàn không" do sinh viên bấm trên trang quán
DO $$ BEGIN
  CREATE TYPE "SeatStatus" AS ENUM ('PLENTY', 'FEW', 'FULL');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "place_seat_reports" (
  "id" TEXT NOT NULL,
  "placeId" TEXT NOT NULL,
  "userId" TEXT,
  "status" "SeatStatus" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "place_seat_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "place_seat_reports_placeId_createdAt_idx" ON "place_seat_reports" ("placeId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "place_seat_reports" ADD CONSTRAINT "place_seat_reports_placeId_fkey"
    FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "place_seat_reports" ADD CONSTRAINT "place_seat_reports_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
