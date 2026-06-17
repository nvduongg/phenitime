-- Đổi mã hình thức học FACE → OFFLINE (giữ LT/TH map qua normalize)
UPDATE "courses"
SET "class_type" = 'OFFLINE'
WHERE "class_type" = 'FACE';
