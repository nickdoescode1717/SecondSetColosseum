-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('DRAFT', 'REQUESTED', 'APPROVED', 'RELEASED', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditEventType" ADD VALUE 'SWAP_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE 'SWAP_REQUESTED';
ALTER TYPE "AuditEventType" ADD VALUE 'SWAP_APPROVED';
ALTER TYPE "AuditEventType" ADD VALUE 'SWAP_RELEASED';
ALTER TYPE "AuditEventType" ADD VALUE 'SWAP_CONFIRMED';
ALTER TYPE "AuditEventType" ADD VALUE 'SWAP_FAILED';
ALTER TYPE "AuditEventType" ADD VALUE 'SWAP_CANCELLED';
ALTER TYPE "AuditEventType" ADD VALUE 'ORG_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE 'INVITE_CREATED';
ALTER TYPE "AuditEventType" ADD VALUE 'INVITE_ACCEPTED';
ALTER TYPE "AuditEventType" ADD VALUE 'INVITE_REVOKED';

-- AlterTable
ALTER TABLE "audit_events" ADD COLUMN     "swap_request_id" TEXT;

-- CreateTable
CREATE TABLE "swap_requests" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "chain" "ChainType" NOT NULL DEFAULT 'EVM',
    "chain_name" TEXT NOT NULL,
    "from_token" TEXT NOT NULL,
    "from_token_address" TEXT NOT NULL,
    "from_token_decimals" INTEGER NOT NULL,
    "to_token" TEXT NOT NULL,
    "to_token_address" TEXT NOT NULL,
    "to_token_decimals" INTEGER NOT NULL,
    "from_amount" TEXT NOT NULL,
    "expected_output" TEXT,
    "minimum_output" TEXT,
    "slippage_bps" INTEGER NOT NULL DEFAULT 50,
    "price_impact" TEXT,
    "route" JSONB,
    "quote_timestamp" TIMESTAMP(3),
    "quote_expires_at" TIMESTAMP(3),
    "release_quote_output" TEXT,
    "release_quote_min_output" TEXT,
    "release_quote_timestamp" TIMESTAMP(3),
    "unsigned_tx" JSONB,
    "tx_digest" TEXT,
    "release_token" TEXT,
    "release_token_expires_at" TIMESTAMP(3),
    "tx_hash" TEXT,
    "explorer_url" TEXT,
    "status" "SwapStatus" NOT NULL DEFAULT 'DRAFT',
    "error_message" TEXT,
    "memo" TEXT,
    "created_by" TEXT NOT NULL,
    "submitted_by" TEXT,
    "approved_by" TEXT,
    "released_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swap_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_signing_sessions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "swap_request_id" TEXT NOT NULL,
    "coordinator_session_id" TEXT NOT NULL,
    "qr_code_data" TEXT,
    "status" "SigningSessionStatus" NOT NULL DEFAULT 'PENDING',
    "signed_tx" TEXT,
    "initiated_by" TEXT NOT NULL,
    "error_message" TEXT,
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "swap_signing_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invites" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roles" "UserRole"[],
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_by" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "used_by" TEXT,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "swap_requests_org_id_idx" ON "swap_requests"("org_id");

-- CreateIndex
CREATE INDEX "swap_requests_status_idx" ON "swap_requests"("status");

-- CreateIndex
CREATE INDEX "swap_requests_created_by_idx" ON "swap_requests"("created_by");

-- CreateIndex
CREATE INDEX "swap_requests_vault_id_idx" ON "swap_requests"("vault_id");

-- CreateIndex
CREATE INDEX "swap_requests_tx_hash_idx" ON "swap_requests"("tx_hash");

-- CreateIndex
CREATE UNIQUE INDEX "swap_signing_sessions_swap_request_id_key" ON "swap_signing_sessions"("swap_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "swap_signing_sessions_coordinator_session_id_key" ON "swap_signing_sessions"("coordinator_session_id");

-- CreateIndex
CREATE INDEX "swap_signing_sessions_org_id_idx" ON "swap_signing_sessions"("org_id");

-- CreateIndex
CREATE INDEX "swap_signing_sessions_status_idx" ON "swap_signing_sessions"("status");

-- CreateIndex
CREATE INDEX "swap_signing_sessions_swap_request_id_idx" ON "swap_signing_sessions"("swap_request_id");

-- CreateIndex
CREATE INDEX "swap_signing_sessions_coordinator_session_id_idx" ON "swap_signing_sessions"("coordinator_session_id");

-- CreateIndex
CREATE UNIQUE INDEX "invites_token_key" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_org_id_idx" ON "invites"("org_id");

-- CreateIndex
CREATE INDEX "invites_token_idx" ON "invites"("token");

-- CreateIndex
CREATE INDEX "invites_email_idx" ON "invites"("email");

-- CreateIndex
CREATE INDEX "audit_events_swap_request_id_idx" ON "audit_events"("swap_request_id");

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_swap_request_id_fkey" FOREIGN KEY ("swap_request_id") REFERENCES "swap_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_requests" ADD CONSTRAINT "swap_requests_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_signing_sessions" ADD CONSTRAINT "swap_signing_sessions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_signing_sessions" ADD CONSTRAINT "swap_signing_sessions_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_signing_sessions" ADD CONSTRAINT "swap_signing_sessions_swap_request_id_fkey" FOREIGN KEY ("swap_request_id") REFERENCES "swap_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_used_by_fkey" FOREIGN KEY ("used_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
