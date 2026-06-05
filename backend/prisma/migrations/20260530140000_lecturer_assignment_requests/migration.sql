-- Yêu cầu phân công giảng viên (học phần do đơn vị khác quản lý chuyên môn)
CREATE TABLE "lecturer_assignment_requests" (
    "request_id" VARCHAR(36) NOT NULL,
    "section_id" VARCHAR(100) NOT NULL,
    "semester_id" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "requested_by_user_id" VARCHAR(36) NOT NULL,
    "requester_scope_unit_id" VARCHAR(50) NOT NULL,
    "target_scope_unit_id" VARCHAR(50) NOT NULL,
    "message" TEXT,
    "response_note" TEXT,
    "fulfilled_by_user_id" VARCHAR(36),
    "fulfilled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lecturer_assignment_requests_pkey" PRIMARY KEY ("request_id")
);

CREATE INDEX "lecturer_assignment_requests_section_id_status_idx" ON "lecturer_assignment_requests"("section_id", "status");
CREATE INDEX "lecturer_assignment_requests_target_scope_unit_id_status_idx" ON "lecturer_assignment_requests"("target_scope_unit_id", "status");
CREATE INDEX "lecturer_assignment_requests_requester_scope_unit_id_status_idx" ON "lecturer_assignment_requests"("requester_scope_unit_id", "status");

ALTER TABLE "lecturer_assignment_requests" ADD CONSTRAINT "lecturer_assignment_requests_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("section_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lecturer_assignment_requests" ADD CONSTRAINT "lecturer_assignment_requests_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lecturer_assignment_requests" ADD CONSTRAINT "lecturer_assignment_requests_fulfilled_by_user_id_fkey" FOREIGN KEY ("fulfilled_by_user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "lecturer_assignment_requests" ADD CONSTRAINT "lecturer_assignment_requests_requester_scope_unit_id_fkey" FOREIGN KEY ("requester_scope_unit_id") REFERENCES "organization_units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lecturer_assignment_requests" ADD CONSTRAINT "lecturer_assignment_requests_target_scope_unit_id_fkey" FOREIGN KEY ("target_scope_unit_id") REFERENCES "organization_units"("unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;
