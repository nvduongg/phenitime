-- CreateTable
CREATE TABLE "courses" (
    "course_id" VARCHAR(50) NOT NULL,
    "course_name" VARCHAR(255) NOT NULL,
    "credits" INTEGER NOT NULL,
    "theory_credits" INTEGER NOT NULL,
    "practice_credits" INTEGER NOT NULL,
    "unit_id" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable
CREATE TABLE "course_conditions" (
    "id" SERIAL NOT NULL,
    "course_id" VARCHAR(50) NOT NULL,
    "condition_course_id" VARCHAR(50) NOT NULL,
    "condition_type" VARCHAR(50) NOT NULL,

    CONSTRAINT "course_conditions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curricula" (
    "curriculum_id" VARCHAR(50) NOT NULL,
    "curriculum_name" VARCHAR(255) NOT NULL,
    "major_name" VARCHAR(255) NOT NULL,
    "total_credits" INTEGER NOT NULL,
    "cohort_id" VARCHAR(50) NOT NULL,
    "unit_id" VARCHAR(50) NOT NULL,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("curriculum_id")
);

-- CreateTable
CREATE TABLE "roadmaps" (
    "id" SERIAL NOT NULL,
    "curriculum_id" VARCHAR(50) NOT NULL,
    "course_id" VARCHAR(50) NOT NULL,
    "recommended_semester" INTEGER NOT NULL,
    "course_type" VARCHAR(50) NOT NULL,

    CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_groups" (
    "group_id" VARCHAR(50) NOT NULL,
    "group_name" VARCHAR(255) NOT NULL,
    "curriculum_id" VARCHAR(50) NOT NULL,
    "student_count" INTEGER,

    CONSTRAINT "student_groups_pkey" PRIMARY KEY ("group_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_conditions_course_id_condition_course_id_key" ON "course_conditions"("course_id", "condition_course_id");

-- CreateIndex
CREATE UNIQUE INDEX "roadmaps_curriculum_id_course_id_key" ON "roadmaps"("curriculum_id", "course_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_conditions" ADD CONSTRAINT "course_conditions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_conditions" ADD CONSTRAINT "course_conditions_condition_course_id_fkey" FOREIGN KEY ("condition_course_id") REFERENCES "courses"("course_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_cohort_id_fkey" FOREIGN KEY ("cohort_id") REFERENCES "cohorts"("cohort_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "organization_units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("curriculum_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("course_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_groups" ADD CONSTRAINT "student_groups_curriculum_id_fkey" FOREIGN KEY ("curriculum_id") REFERENCES "curricula"("curriculum_id") ON DELETE RESTRICT ON UPDATE CASCADE;
