-- Bỏ hậu tố .01 cho ngành duy nhất theo mã quốc gia (major_code).
-- Ngành trùng mã QG vẫn giữ .01, .02, ...

BEGIN;

CREATE TEMP TABLE unique_major_simplify (
    old_major_id VARCHAR(50) PRIMARY KEY,
    new_major_id VARCHAR(50) NOT NULL UNIQUE
) ON COMMIT DROP;

INSERT INTO unique_major_simplify (old_major_id, new_major_id)
SELECT m.major_id, m.major_code
FROM majors m
WHERE (
    SELECT COUNT(*) FROM majors m2 WHERE m2.major_code = m.major_code
) = 1
  AND m.major_id <> m.major_code;

SELECT old_major_id, new_major_id FROM unique_major_simplify ORDER BY new_major_id;

UPDATE curricula c
SET curriculum_id = s.new_major_id || '-' || c.cohort_id
FROM unique_major_simplify s
WHERE c.major_id = s.old_major_id
  AND c.curriculum_id <> s.new_major_id || '-' || c.cohort_id;

UPDATE majors maj
SET major_id = s.new_major_id
FROM unique_major_simplify s
WHERE maj.major_id = s.old_major_id;

COMMIT;

SELECT major_id, major_code, major_name FROM majors ORDER BY major_code, major_id;
