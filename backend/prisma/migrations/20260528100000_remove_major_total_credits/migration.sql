ALTER TABLE "majors" DROP COLUMN IF EXISTS "total_credits";

ALTER TABLE "curricula" ALTER COLUMN "total_credits" SET DEFAULT 0;

UPDATE "curricula" c
SET "total_credits" = COALESCE((
    SELECT SUM(co.credits)
    FROM "roadmaps" r
    INNER JOIN "courses" co ON co.course_id = r.course_id
    WHERE r.curriculum_id = c.curriculum_id
), 0);
