ALTER TABLE "majors" ADD COLUMN "major_code" VARCHAR(20);

UPDATE "majors"
SET "major_code" = "major_id"
WHERE "major_code" IS NULL;

ALTER TABLE "majors" ALTER COLUMN "major_code" SET NOT NULL;
