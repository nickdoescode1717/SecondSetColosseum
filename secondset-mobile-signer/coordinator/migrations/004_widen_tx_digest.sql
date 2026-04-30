-- 004_widen_tx_digest.sql
-- Widen tx_digest in signing_sessions to TEXT to accommodate Solana serialized
-- transaction messages (can be 300+ hex chars, far exceeding the VARCHAR(128) limit).

ALTER TABLE signing_sessions
  ALTER COLUMN tx_digest TYPE TEXT;
