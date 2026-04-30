-- CreateEnum
CREATE TYPE "PayeeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'PAYEE_APPROVED';
ALTER TYPE "AuditEventType" ADD VALUE 'PAYEE_REJECTED';

-- AlterTable
ALTER TABLE "payees" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" TEXT,
ADD COLUMN     "rejected_at" TIMESTAMP(3),
ADD COLUMN     "status" "PayeeStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "payees_status_idx" ON "payees"("status");

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
