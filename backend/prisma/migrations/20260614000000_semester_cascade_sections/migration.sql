-- Xóa học kỳ → tự xóa lớp học phần (TKB/yêu cầu phân công GV cascade từ course_sections)
ALTER TABLE "course_sections" DROP CONSTRAINT "course_sections_semester_id_fkey";

ALTER TABLE "course_sections"
    ADD CONSTRAINT "course_sections_semester_id_fkey"
    FOREIGN KEY ("semester_id") REFERENCES "semesters"("semester_id")
    ON DELETE CASCADE ON UPDATE CASCADE;
