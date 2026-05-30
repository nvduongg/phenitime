-- CreateTable
CREATE TABLE "organization_units" (
    "unit_id" VARCHAR(50) NOT NULL,
    "unit_name" VARCHAR(255) NOT NULL,
    "unit_type" VARCHAR(50) NOT NULL,
    "parent_id" VARCHAR(50),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_units_pkey" PRIMARY KEY ("unit_id")
);

-- CreateTable
CREATE TABLE "cohorts" (
    "cohort_id" VARCHAR(50) NOT NULL,
    "start_year" INTEGER NOT NULL,
    "training_type" VARCHAR(100),
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cohorts_pkey" PRIMARY KEY ("cohort_id")
);

-- CreateTable
CREATE TABLE "semesters" (
    "semester_id" VARCHAR(50) NOT NULL,
    "semester_name" VARCHAR(255) NOT NULL,
    "academic_year" VARCHAR(20) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "created_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("semester_id")
);

-- AddForeignKey
ALTER TABLE "organization_units" ADD CONSTRAINT "organization_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organization_units"("unit_id") ON DELETE SET NULL ON UPDATE CASCADE;
