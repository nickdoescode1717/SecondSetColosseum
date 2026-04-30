-- CreateEnum
CREATE TYPE "KeygenSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "SigningSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'KEYGEN_INITIATED';
ALTER TYPE "AuditEventType" ADD VALUE 'KEYGEN_COMPLETED';
ALTER TYPE "AuditEventType" ADD VALUE 'KEYGEN_FAILED';
ALTER TYPE "AuditEventType" ADD VALUE 'SIGNING_INITIATED';
ALTER TYPE "AuditEventType" ADD VALUE 'SIGNING_COMPLETED';
ALTER TYPE "AuditEventType" ADD VALUE 'SIGNING_FAILED';

-- CreateTable
CREATE TABLE "keygen_sessions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "coordinator_session_id" TEXT NOT NULL,
    "qr_code_data" TEXT NOT NULL,
    "status" "KeygenSessionStatus" NOT NULL DEFAULT 'PENDING',
    "wallet_address" TEXT,
    "chain" "ChainType" NOT NULL,
    "chain_name" TEXT NOT NULL,
    "vault_id" TEXT,
    "initiated_by" TEXT NOT NULL,
    "error_message" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "keygen_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_sessions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "coordinator_session_id" TEXT NOT NULL,
    "qr_code_data" TEXT,
    "status" "SigningSessionStatus" NOT NULL DEFAULT 'PENDING',
    "signed_tx" TEXT,
    "initiated_by" TEXT NOT NULL,
    "error_message" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "signing_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "keygen_sessions_coordinator_session_id_key" ON "keygen_sessions"("coordinator_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "keygen_sessions_vault_id_key" ON "keygen_sessions"("vault_id");

-- CreateIndex
CREATE INDEX "keygen_sessions_org_id_idx" ON "keygen_sessions"("org_id");

-- CreateIndex
CREATE INDEX "keygen_sessions_status_idx" ON "keygen_sessions"("status");

-- CreateIndex
CREATE INDEX "keygen_sessions_coordinator_session_id_idx" ON "keygen_sessions"("coordinator_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "signing_sessions_request_id_key" ON "signing_sessions"("request_id");

-- CreateIndex
CREATE UNIQUE INDEX "signing_sessions_coordinator_session_id_key" ON "signing_sessions"("coordinator_session_id");

-- CreateIndex
CREATE INDEX "signing_sessions_org_id_idx" ON "signing_sessions"("org_id");

-- CreateIndex
CREATE INDEX "signing_sessions_status_idx" ON "signing_sessions"("status");

-- CreateIndex
CREATE INDEX "signing_sessions_request_id_idx" ON "signing_sessions"("request_id");

-- CreateIndex
CREATE INDEX "signing_sessions_coordinator_session_id_idx" ON "signing_sessions"("coordinator_session_id");

-- AddForeignKey
ALTER TABLE "keygen_sessions" ADD CONSTRAINT "keygen_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keygen_sessions" ADD CONSTRAINT "keygen_sessions_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keygen_sessions" ADD CONSTRAINT "keygen_sessions_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_sessions" ADD CONSTRAINT "signing_sessions_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
