-- Quyết định 1062: canonical credit fields + section schedule metadata
ALTER TABLE "courses" ADD COLUMN "tc_lt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "courses" ADD COLUMN "tc_th" INTEGER NOT NULL DEFAULT 0;

UPDATE "courses"
SET
  "tc_lt" = ROUND("theory_credits"::numeric)::integer,
  "tc_th" = ROUND("practice_credits"::numeric)::integer;

ALTER TABLE "course_sections" ADD COLUMN "st_per_week" INTEGER;
ALTER TABLE "course_sections" ADD COLUMN "duration_weeks" INTEGER;
