-- CreateTable
CREATE TABLE "lecturers" (
    "lecturer_id" VARCHAR(50) NOT NULL,
    "lecturer_name" VARCHAR(255) NOT NULL,
    "unit_id" VARCHAR(50) NOT NULL,

    CONSTRAINT "lecturers_pkey" PRIMARY KEY ("lecturer_id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "room_id" VARCHAR(50) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "room_type" VARCHAR(50) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("room_id")
);

-- CreateTable
CREATE TABLE "course_sections" (
    "section_id" VARCHAR(100) NOT NULL,
    "course_id" VARCHAR(50) NOT NULL,
    "semester_id" VARCHAR(50) NOT NULL,
    "lecturer_id" VARCHAR(50),
    "class_type" VARCHAR(10) NOT NULL,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("section_id")
);

-- CreateTable
CREATE TABLE "timetables" (
    "schedule_id" SERIAL NOT NULL,
    "section_id" VARCHAR(100) NOT NULL,
    "room_id" VARCHAR(50),
    "day_of_week" INTEGER NOT NULL,
    "start_period" INTEGER NOT NULL,
    "period_count" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,

    CONSTRAINT "timetables_pkey" PRIMARY KEY ("schedule_id")
);

-- CreateTable
CREATE TABLE "_CourseSectionToStudentGroup" (
    "A" VARCHAR(100) NOT NULL,
    "B" VARCHAR(50) NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "_CourseSectionToStudentGroup_AB_unique" ON "_CourseSectionToStudentGroup"("A", "B");

-- CreateIndex
CREATE INDEX "_CourseSectionToStudentGroup_B_index" ON "_CourseSectionToStudentGroup"("B");

-- AddForeignKey
ALTER TABLE "lecturers" ADD CONSTRAINT "lecturers_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("semester_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_sections" ADD CONSTRAINT "course_sections_lecturer_id_fkey" FOREIGN KEY ("lecturer_id") REFERENCES "lecturers"("lecturer_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("section_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timetables" ADD CONSTRAINT "timetables_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("room_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseSectionToStudentGroup" ADD CONSTRAINT "_CourseSectionToStudentGroup_A_fkey" FOREIGN KEY ("A") REFERENCES "course_sections"("section_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CourseSectionToStudentGroup" ADD CONSTRAINT "_CourseSectionToStudentGroup_B_fkey" FOREIGN KEY ("B") REFERENCES "student_groups"("group_id") ON DELETE CASCADE ON UPDATE CASCADE;
