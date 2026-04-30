-- 002_signing_tables.sql
-- Migration to add signing ceremony tables

-- ============================================================================
-- SIGNING SESSIONS TABLE
-- ============================================================================

CREATE TABLE signing_sessions (
  session_id UUID PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  request_id VARCHAR(255) NOT NULL,  -- Web app's payment request ID
  tx_digest VARCHAR(66) NOT NULL,     -- Keccak256 hash of transaction (0x + 64 hex chars)
  tx_details JSONB NOT NULL,          -- Transaction parameters (to, value, token, data, etc.)
  required_signers INT NOT NULL DEFAULT 2,
  status VARCHAR(50) NOT NULL DEFAULT 'waiting_for_signers',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  signature JSONB,                    -- {r: '0x...', s: '0x...', v: 27|28}
  tx_hash VARCHAR(66),                -- Blockchain transaction hash (from web app after broadcast)
  error_code VARCHAR(50),
  error_message TEXT
);

-- Indexes for signing_sessions
CREATE INDEX idx_signing_sessions_org_id ON signing_sessions(org_id);
CREATE INDEX idx_signing_sessions_wallet_address ON signing_sessions(wallet_address);
CREATE INDEX idx_signing_sessions_request_id ON signing_sessions(request_id);
CREATE INDEX idx_signing_sessions_status ON signing_sessions(status);
CREATE INDEX idx_signing_sessions_expires_at ON signing_sessions(expires_at);

-- ============================================================================
-- SIGNING PARTICIPANTS TABLE
-- ============================================================================

CREATE TABLE signing_participants (
  participant_id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES signing_sessions(session_id) ON DELETE CASCADE,
  device_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL,           -- cfo, controller, backup
  signer_index INT NOT NULL,           -- 1, 2, or 3 (from keygen)
  biometric_verified BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  connection_status VARCHAR(20),       -- connected, disconnected
  nonce_point TEXT,                    -- R_i (hex-encoded elliptic curve point)
  partial_signature TEXT,              -- s_i (hex-encoded)
  completed_at TIMESTAMPTZ
);

-- Indexes for signing_participants
CREATE INDEX idx_signing_participants_session_id ON signing_participants(session_id);
CREATE INDEX idx_signing_participants_device_id ON signing_participants(device_id);

-- Unique constraints to prevent duplicate participants
CREATE UNIQUE INDEX idx_unique_device_per_signing_session
  ON signing_participants(session_id, device_id);

CREATE UNIQUE INDEX idx_unique_role_per_signing_session
  ON signing_participants(session_id, role);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE signing_sessions IS 'Stores 2-of-3 threshold signature ceremony sessions';
COMMENT ON TABLE signing_participants IS 'Tracks participants in signing ceremonies';

COMMENT ON COLUMN signing_sessions.tx_digest IS 'Keccak256 hash of transaction to be signed';
COMMENT ON COLUMN signing_sessions.required_signers IS 'Number of signers required (typically 2 for 2-of-3)';
COMMENT ON COLUMN signing_sessions.signature IS 'Final ECDSA signature in JSON format {r, s, v}';

COMMENT ON COLUMN signing_participants.nonce_point IS 'Elliptic curve nonce point R_i for partial signature';
COMMENT ON COLUMN signing_participants.partial_signature IS 'Partial signature s_i before Lagrange combination';
COMMENT ON COLUMN signing_participants.signer_index IS 'Index from keygen ceremony (1, 2, or 3)';
