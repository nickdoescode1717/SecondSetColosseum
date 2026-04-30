-- CreateEnum
CREATE TYPE "PayeeActionType" AS ENUM ('EDIT', 'DELETE');

-- CreateEnum
CREATE TYPE "PayeeActionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "payee_actions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "action_type" "PayeeActionType" NOT NULL,
    "status" "PayeeActionStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by" TEXT NOT NULL,
    "approved_by" TEXT,
    "rejected_by" TEXT,
    "proposed_changes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approved_at" TIMESTAMP(3),
    "rejected_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payee_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payee_actions_org_id_idx" ON "payee_actions"("org_id");

-- CreateIndex
CREATE INDEX "payee_actions_payee_id_idx" ON "payee_actions"("payee_id");

-- CreateIndex
CREATE INDEX "payee_actions_status_idx" ON "payee_actions"("status");

-- AddForeignKey
ALTER TABLE "payee_actions" ADD CONSTRAINT "payee_actions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_actions" ADD CONSTRAINT "payee_actions_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_actions" ADD CONSTRAINT "payee_actions_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_actions" ADD CONSTRAINT "payee_actions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payee_actions" ADD CONSTRAINT "payee_actions_rejected_by_fkey" FOREIGN KEY ("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
