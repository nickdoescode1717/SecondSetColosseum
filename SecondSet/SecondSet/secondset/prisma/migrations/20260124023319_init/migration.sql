-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('INITIATOR', 'APPROVER', 'SIGNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ChainType" AS ENUM ('EVM', 'SOLANA');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'READY_TO_RELEASE', 'BROADCASTED', 'CONFIRMED', 'REJECTED', 'FAILED_BROADCAST', 'FAILED_CONFIRM');

-- CreateEnum
CREATE TYPE "AuditEventType" AS ENUM ('REQUEST_CREATED', 'REQUEST_SUBMITTED', 'REQUEST_APPROVED', 'REQUEST_REJECTED', 'REQUEST_RELEASED', 'REQUEST_BROADCASTED', 'REQUEST_CONFIRMED', 'REQUEST_FAILED', 'PAYEE_CREATED', 'PAYEE_UPDATED', 'USER_ROLE_ASSIGNED', 'USER_ROLE_REVOKED', 'VAULT_CREATED');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "turnkey_user_id" TEXT,
    "hashed_password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "roles" "UserRole"[],

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "assigned_by" TEXT,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaults" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "chain" "ChainType" NOT NULL,
    "address" TEXT NOT NULL,
    "turnkey_wallet_id" TEXT NOT NULL,
    "turnkey_wallet_account_id" TEXT,
    "name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payees" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "chain" "ChainType" NOT NULL,
    "address" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_email" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_requests" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "payee_id" TEXT NOT NULL,
    "chain" "ChainType" NOT NULL,
    "asset" TEXT NOT NULL DEFAULT 'USDC',
    "amount_minor" TEXT NOT NULL,
    "memo" TEXT,
    "attachment_url" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by" TEXT NOT NULL,
    "submitted_by" TEXT,
    "approved_by" TEXT,
    "released_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),
    "broadcasted_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "unsigned_tx" JSONB,
    "tx_digest" TEXT,
    "tx_hash" TEXT,
    "explorer_url" TEXT,
    "confirmation_count" INTEGER NOT NULL DEFAULT 0,
    "release_token" TEXT,
    "release_token_expires_at" TIMESTAMP(3),
    "release_nonce" TEXT,
    "policy_version" INTEGER NOT NULL DEFAULT 1,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "event_type" "AuditEventType" NOT NULL,
    "user_id" TEXT,
    "request_id" TEXT,
    "metadata" JSONB,
    "previous_hash" TEXT,
    "event_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "broadcast_jobs" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "broadcast_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_org_id_email_key" ON "users"("org_id", "email");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_key" ON "user_roles"("user_id", "role");

-- CreateIndex
CREATE INDEX "vaults_org_id_idx" ON "vaults"("org_id");

-- CreateIndex
CREATE INDEX "vaults_address_idx" ON "vaults"("address");

-- CreateIndex
CREATE UNIQUE INDEX "vaults_org_id_chain_address_key" ON "vaults"("org_id", "chain", "address");

-- CreateIndex
CREATE INDEX "payees_org_id_idx" ON "payees"("org_id");

-- CreateIndex
CREATE INDEX "payees_chain_address_idx" ON "payees"("chain", "address");

-- CreateIndex
CREATE UNIQUE INDEX "payees_org_id_chain_address_key" ON "payees"("org_id", "chain", "address");

-- CreateIndex
CREATE INDEX "payment_requests_org_id_idx" ON "payment_requests"("org_id");

-- CreateIndex
CREATE INDEX "payment_requests_status_idx" ON "payment_requests"("status");

-- CreateIndex
CREATE INDEX "payment_requests_created_by_idx" ON "payment_requests"("created_by");

-- CreateIndex
CREATE INDEX "payment_requests_vault_id_idx" ON "payment_requests"("vault_id");

-- CreateIndex
CREATE INDEX "payment_requests_tx_hash_idx" ON "payment_requests"("tx_hash");

-- CreateIndex
CREATE INDEX "audit_events_org_id_idx" ON "audit_events"("org_id");

-- CreateIndex
CREATE INDEX "audit_events_request_id_idx" ON "audit_events"("request_id");

-- CreateIndex
CREATE INDEX "audit_events_user_id_idx" ON "audit_events"("user_id");

-- CreateIndex
CREATE INDEX "audit_events_created_at_idx" ON "audit_events"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "broadcast_jobs_request_id_key" ON "broadcast_jobs"("request_id");

-- CreateIndex
CREATE INDEX "broadcast_jobs_request_id_idx" ON "broadcast_jobs"("request_id");

-- CreateIndex
CREATE INDEX "broadcast_jobs_status_idx" ON "broadcast_jobs"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaults" ADD CONSTRAINT "vaults_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payees" ADD CONSTRAINT "payees_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_payee_id_fkey" FOREIGN KEY ("payee_id") REFERENCES "payees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_submitted_by_fkey" FOREIGN KEY ("submitted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_requests" ADD CONSTRAINT "payment_requests_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "payment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "broadcast_jobs" ADD CONSTRAINT "broadcast_jobs_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "payment_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
