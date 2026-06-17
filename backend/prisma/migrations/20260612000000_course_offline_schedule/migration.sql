-- Cấu hình buổi offline trên học phần (Coursera / Hybrid / TH thủ công)
ALTER TABLE "courses"
  ADD COLUMN "offline_session_count" INTEGER,
  ADD COLUMN "offline_periods_per_session" INTEGER DEFAULT 3,
  ADD COLUMN "offline_week_rhythm" VARCHAR(30),
  ADD COLUMN "offline_week_interval" INTEGER,
  ADD COLUMN "offline_active_weeks" VARCHAR(200);
