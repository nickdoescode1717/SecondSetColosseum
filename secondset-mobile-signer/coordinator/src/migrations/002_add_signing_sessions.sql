-- Signing Sessions
CREATE TABLE signing_sessions (
  id SERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  org_id VARCHAR(255) NOT NULL,
  wallet_address VARCHAR(42) NOT NULL,
  request_id VARCHAR(255) NOT NULL,
  tx_digest VARCHAR(66) NOT NULL,
  tx_details JSONB NOT NULL,
  required_signers INT NOT NULL DEFAULT 2,
  status VARCHAR(50) NOT NULL DEFAULT 'waiting_for_signers',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  signature JSONB,
  tx_hash VARCHAR(66),
  error_code VARCHAR(50),
  error_message TEXT
);

CREATE INDEX idx_signing_session_id ON signing_sessions(session_id);
CREATE INDEX idx_signing_wallet_address ON signing_sessions(wallet_address);
CREATE INDEX idx_signing_status ON signing_sessions(status);

-- Signing Participants
CREATE TABLE signing_participants (
  id SERIAL PRIMARY KEY,
  participant_id UUID NOT NULL,
  session_id UUID NOT NULL REFERENCES signing_sessions(session_id),
  device_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL,
  signer_index INT NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  connection_status VARCHAR(20),
  biometric_verified BOOLEAN NOT NULL DEFAULT FALSE,
  partial_signature TEXT,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_signing_participant_session ON signing_participants(session_id);
CREATE INDEX idx_signing_participant_device ON signing_participants(device_id);
