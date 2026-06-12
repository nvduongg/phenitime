-- Migrate internal major IDs: 7480201-CNTT -> 7480201.01, etc.
-- curriculum_id follows pattern {major_id}-{cohort_id}; FKs use ON UPDATE CASCADE.

BEGIN;

CREATE TEMP TABLE major_id_migration (
    old_major_id VARCHAR(50) PRIMARY KEY,
    new_major_id VARCHAR(50) NOT NULL UNIQUE
) ON COMMIT DROP;

WITH ranked AS (
    SELECT
        major_id,
        major_code,
        ROW_NUMBER() OVER (PARTITION BY major_code ORDER BY major_id) AS rn
    FROM majors
)
INSERT INTO major_id_migration (old_major_id, new_major_id)
SELECT
    major_id,
    major_code || '.' || LPAD(rn::text, 2, '0')
FROM ranked
WHERE major_id <> major_code || '.' || LPAD(rn::text, 2, '0');

-- Show planned changes
SELECT old_major_id, new_major_id FROM major_id_migration ORDER BY new_major_id;

-- Update curriculum PK first (cascades to roadmaps, student_groups)
UPDATE curricula c
SET curriculum_id = m.new_major_id || '-' || c.cohort_id
FROM major_id_migration m
WHERE c.major_id = m.old_major_id
  AND c.curriculum_id <> m.new_major_id || '-' || c.cohort_id;

-- Update major PK (cascades to curricula.major_id)
UPDATE majors maj
SET major_id = m.new_major_id
FROM major_id_migration m
WHERE maj.major_id = m.old_major_id;

COMMIT;

-- Verify
SELECT major_id, major_code, major_name FROM majors ORDER BY major_code, major_id;
