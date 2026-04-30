-- 003_add_chain_curve_type.sql
-- Migration to add chain, curve_type, and vault_id columns for multi-chain support

-- ============================================================================
-- KEYGEN SESSIONS: Add chain, curve_type, vault_id
-- ============================================================================

ALTER TABLE keygen_sessions
  ADD COLUMN vault_id UUID,
  ADD COLUMN chain VARCHAR(20) NOT NULL DEFAULT 'EVM',
  ADD COLUMN curve_type VARCHAR(20) NOT NULL DEFAULT 'secp256k1';

-- Widen wallet_address to accommodate Solana base58 addresses (32-44 chars)
ALTER TABLE keygen_sessions
  ALTER COLUMN wallet_address TYPE VARCHAR(64);

-- ============================================================================
-- KEYGEN PARTICIPANTS: Widen reported_address
-- ============================================================================

ALTER TABLE keygen_participants
  ALTER COLUMN reported_address TYPE VARCHAR(64);

-- ============================================================================
-- SIGNING SESSIONS: Add chain, curve_type, vault_id; widen columns
-- ============================================================================

ALTER TABLE signing_sessions
  ADD COLUMN vault_id UUID,
  ADD COLUMN chain VARCHAR(20) NOT NULL DEFAULT 'EVM',
  ADD COLUMN curve_type VARCHAR(20) NOT NULL DEFAULT 'secp256k1';

-- Widen wallet_address for Solana
ALTER TABLE signing_sessions
  ALTER COLUMN wallet_address TYPE VARCHAR(64);

-- Widen tx_digest for non-EVM digests
ALTER TABLE signing_sessions
  ALTER COLUMN tx_digest TYPE VARCHAR(128);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX idx_keygen_sessions_chain ON keygen_sessions(chain);
CREATE INDEX idx_keygen_sessions_vault_id ON keygen_sessions(vault_id);
CREATE INDEX idx_signing_sessions_chain ON signing_sessions(chain);
CREATE INDEX idx_signing_sessions_vault_id ON signing_sessions(vault_id);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON COLUMN keygen_sessions.vault_id IS 'Pre-generated vault UUID from web app, consistent across all systems';
COMMENT ON COLUMN keygen_sessions.chain IS 'Blockchain type: EVM or SOLANA';
COMMENT ON COLUMN keygen_sessions.curve_type IS 'Cryptographic curve: secp256k1 (ECDSA) or ed25519 (EdDSA)';

COMMENT ON COLUMN signing_sessions.vault_id IS 'Vault UUID being signed for';
COMMENT ON COLUMN signing_sessions.chain IS 'Blockchain type: EVM or SOLANA';
COMMENT ON COLUMN signing_sessions.curve_type IS 'Cryptographic curve: secp256k1 (ECDSA) or ed25519 (EdDSA)';
