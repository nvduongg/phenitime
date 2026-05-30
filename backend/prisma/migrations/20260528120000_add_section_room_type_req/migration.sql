-- Course.default_room_type mirrors room_type for explicit generation semantics
ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "default_room_type" VARCHAR(50);

UPDATE "courses"
SET "default_room_type" = "room_type"
WHERE "default_room_type" IS NULL;

ALTER TABLE "courses" ALTER COLUMN "default_room_type" SET DEFAULT 'LT';

UPDATE "courses"
SET "default_room_type" = 'LT'
WHERE "default_room_type" IS NULL;

ALTER TABLE "courses" ALTER COLUMN "default_room_type" SET NOT NULL;

-- Explicit room requirement per generated/imported course section
ALTER TABLE "course_sections" ADD COLUMN IF NOT EXISTS "room_type_req" VARCHAR(50) NOT NULL DEFAULT 'LT';

-- Backfill from linked course default room type where possible
UPDATE "course_sections" cs
SET "room_type_req" = COALESCE(c."default_room_type", c."room_type", 'LT')
FROM "courses" c
WHERE cs."course_id" = c."course_id"
  AND cs."room_type_req" = 'LT';
