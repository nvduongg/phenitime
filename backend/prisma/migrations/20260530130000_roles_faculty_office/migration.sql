-- Đổi vai trò cũ SCHOOL_TRAINING (đã bỏ) sang SCHOOL_OFFICE
UPDATE "users" SET "role" = 'SCHOOL_OFFICE' WHERE "role" = 'SCHOOL_TRAINING';
