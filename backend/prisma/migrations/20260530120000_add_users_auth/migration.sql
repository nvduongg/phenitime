-- CreateTable
CREATE TABLE "users" (
    "user_id" VARCHAR(36) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "full_name" VARCHAR(255) NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "scope_unit_id" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_scope_unit_id_idx" ON "users"("scope_unit_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_scope_unit_id_fkey" FOREIGN KEY ("scope_unit_id") REFERENCES "organization_units"("unit_id") ON DELETE SET NULL ON UPDATE CASCADE;
