-- Đợt trong học kỳ (niên khóa giao nhau)
CREATE TABLE "semester_waves" (
    "wave_id" VARCHAR(80) NOT NULL,
    "semester_id" VARCHAR(50) NOT NULL,
    "wave_order" INTEGER NOT NULL,
    "wave_name" VARCHAR(100),
    "start_week" INTEGER NOT NULL DEFAULT 1,
    "cohort_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "semester_waves_pkey" PRIMARY KEY ("wave_id")
);

CREATE UNIQUE INDEX "semester_waves_semester_id_wave_order_key"
    ON "semester_waves"("semester_id", "wave_order");

ALTER TABLE "semester_waves"
    ADD CONSTRAINT "semester_waves_semester_id_fkey"
    FOREIGN KEY ("semester_id") REFERENCES "semesters"("semester_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
