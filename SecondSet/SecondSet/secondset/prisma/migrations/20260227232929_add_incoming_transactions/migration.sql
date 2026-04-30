-- AlterEnum
ALTER TYPE "AuditEventType" ADD VALUE 'PAYMENT_RECEIVED';

-- AlterTable
ALTER TABLE "vaults" ADD COLUMN     "last_checked_block" BIGINT,
ADD COLUMN     "last_checked_signature" TEXT;

-- CreateTable
CREATE TABLE "incoming_transactions" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "tx_hash" TEXT NOT NULL,
    "from_address" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "amount_raw" TEXT NOT NULL,
    "chain_name" TEXT NOT NULL,
    "block_number" BIGINT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incoming_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incoming_transactions_org_id_idx" ON "incoming_transactions"("org_id");

-- CreateIndex
CREATE INDEX "incoming_transactions_vault_id_idx" ON "incoming_transactions"("vault_id");

-- CreateIndex
CREATE INDEX "incoming_transactions_detected_at_idx" ON "incoming_transactions"("detected_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "incoming_transactions_tx_hash_vault_id_asset_key" ON "incoming_transactions"("tx_hash", "vault_id", "asset");

-- AddForeignKey
ALTER TABLE "incoming_transactions" ADD CONSTRAINT "incoming_transactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incoming_transactions" ADD CONSTRAINT "incoming_transactions_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vaults"("id") ON DELETE CASCADE ON UPDATE CASCADE;
