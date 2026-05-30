-- CreateTable
CREATE TABLE "majors" (
    "major_id" VARCHAR(50) NOT NULL,
    "major_name" VARCHAR(255) NOT NULL,
    "total_credits" INTEGER NOT NULL DEFAULT 120,
    "unit_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "majors_pkey" PRIMARY KEY ("major_id")
);

ALTER TABLE "majors"
ADD CONSTRAINT "majors_unit_id_fkey"
FOREIGN KEY ("unit_id") REFERENCES "organization_units"("unit_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed majors from existing curriculum major_name values
INSERT INTO "majors" ("major_id", "major_name", "total_credits", "unit_id")
SELECT
    'CNTT',
    c.major_name,
    c.total_credits,
    c.unit_id
FROM "curricula" c
WHERE c.major_name IS NOT NULL
LIMIT 1
ON CONFLICT ("major_id") DO NOTHING;

INSERT INTO "majors" ("major_id", "major_name", "total_credits", "unit_id")
SELECT DISTINCT ON (c.major_name, c.unit_id)
    CONCAT('MAJ_', ROW_NUMBER() OVER (ORDER BY c.major_name, c.unit_id)),
    c.major_name,
    c.total_credits,
    c.unit_id
FROM "curricula" c
WHERE NOT EXISTS (
    SELECT 1 FROM "majors" m
    WHERE m.major_name = c.major_name AND m.unit_id = c.unit_id
);

ALTER TABLE "curricula" ADD COLUMN "major_id" VARCHAR(50);

UPDATE "curricula" c
SET "major_id" = m.major_id
FROM "majors" m
WHERE c.major_name = m.major_name
  AND c.unit_id = m.unit_id;

UPDATE "curricula"
SET "major_id" = 'CNTT'
WHERE "major_id" IS NULL;

ALTER TABLE "curricula" ALTER COLUMN "major_id" SET NOT NULL;

ALTER TABLE "curricula"
ADD CONSTRAINT "curricula_major_id_fkey"
FOREIGN KEY ("major_id") REFERENCES "majors"("major_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "curricula" DROP COLUMN "major_name";
