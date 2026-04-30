-- 005_recovery_tables.sql
-- Vault Recovery Ceremony tables
-- Additive migration: does NOT modify any existing tables

-- ==========================================================================
-- RECOVERY SESSIONS
-- ==========================================================================

CREATE TABLE recovery_sessions (
  session_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                VARCHAR(255) NOT NULL,
  vault_id              UUID NOT NULL,
  wallet_address        VARCHAR(64) NOT NULL,
  chain                 VARCHAR(20) NOT NULL,
  curve_type            VARCHAR(20) NOT NULL,
  admin_user_id         VARCHAR(255) NOT NULL,
  initiated_by_ip       INET,
  reason                TEXT,
  status                VARCHAR(50) NOT NULL DEFAULT 'open',
  -- State machine: open → locked → in_progress → verifying → complete | failed | expired | cancelled
  join_token            VARCHAR(100) NOT NULL UNIQUE,
  short_code            VARCHAR(50) NOT NULL UNIQUE,
  threshold_policy      JSONB NOT NULL DEFAULT '{"formula":"ceil_2n_3","min_threshold":2,"allow_m_one":false}',
  old_threshold         INT NOT NULL DEFAULT 2,
  computed_old_n        INT,
  computed_new_n        INT,
  computed_m            INT,
  expires_at            TIMESTAMPTZ NOT NULL,
  locked_at             TIMESTAMPTZ,
  started_at            TIMESTAMPTZ,
  verifying_at          TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  error_code            VARCHAR(50),
  error_message         TEXT,
  recovery_record       JSONB,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_recovery_sessions_org_id ON recovery_sessions(org_id);
CREATE INDEX idx_recovery_sessions_vault_id ON recovery_sessions(vault_id);
CREATE INDEX idx_recovery_sessions_wallet_address ON recovery_sessions(wallet_address);
CREATE INDEX idx_recovery_sessions_status ON recovery_sessions(status);
CREATE INDEX idx_recovery_sessions_join_token ON recovery_sessions(join_token);

-- ==========================================================================
-- RECOVERY PARTICIPANTS
-- ==========================================================================

CREATE TABLE recovery_participants (
  participant_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id               UUID NOT NULL REFERENCES recovery_sessions(session_id) ON DELETE CASCADE,
  device_id                VARCHAR(255) NOT NULL,
  participant_type         VARCHAR(20) NOT NULL,  -- old_signer | new_signer
  role                     VARCHAR(20) NOT NULL,  -- cfo | controller | backup | recovery_signer
  old_signer_index         INT,   -- original keygen index for old_signers; NULL for new_signers
  new_signer_index         INT,   -- 1..n_new assigned at LOCK for new_signers; NULL for old_signers
  device_public_key        TEXT NOT NULL,
  device_os                VARCHAR(20),
  device_os_version        VARCHAR(50),
  app_version              VARCHAR(50),
  biometric_verified       BOOLEAN DEFAULT false,
  joined_at                TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at             TIMESTAMPTZ,
  connection_status        VARCHAR(20) DEFAULT 'pending',  -- pending | connected | disconnected
  reported_address         VARCHAR(64),     -- new_signers report derived address
  recovery_completed       BOOLEAN DEFAULT false,
  old_share_deletion_confirmed  BOOLEAN,   -- old_signers only
  completed_at             TIMESTAMPTZ,
  UNIQUE(session_id, device_id)
);

CREATE INDEX idx_recovery_participants_session_id ON recovery_participants(session_id);
CREATE INDEX idx_recovery_participants_device_id ON recovery_participants(device_id);

-- Audit event types (uses existing audit_events table):
-- recovery_initiated, recovery_locked, recovery_started, recovery_complete,
-- recovery_failed, recovery_cancelled, recovery_share_deleted

COMMENT ON TABLE recovery_sessions IS 'Vault recovery ceremonies. Never stores key material.';
COMMENT ON TABLE recovery_participants IS 'Devices participating in a vault recovery ceremony.';
COMMENT ON COLUMN recovery_sessions.wallet_address IS 'Vault address being recovered (immutable, consensus check target)';
COMMENT ON COLUMN recovery_sessions.old_threshold IS 'Original ceremony threshold (typically 2 for 2-of-3)';
COMMENT ON COLUMN recovery_sessions.threshold_policy IS 'Policy for computing new threshold: formula, min_threshold, allow_m_one';
COMMENT ON COLUMN recovery_participants.participant_type IS 'old_signer = has existing key share, new_signer = receiving new share';
