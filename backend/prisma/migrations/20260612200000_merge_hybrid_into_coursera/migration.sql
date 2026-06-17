-- Gộp HYBRID vào COURSERA (Coursera = online + buổi gặp mặt offline)
UPDATE "courses"
SET "class_type" = 'COURSERA'
WHERE "class_type" = 'HYBRID';
