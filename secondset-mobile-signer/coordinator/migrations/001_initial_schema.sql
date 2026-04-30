-- Keygen Sessions
CREATE TABLE keygen_sessions (
  session_id UUID PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL,
  admin_user_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  join_token VARCHAR(100) UNIQUE NOT NULL,
  short_code VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  wallet_address VARCHAR(42),
  public_key TEXT,
  error_code VARCHAR(50),
  error_message TEXT
);

CREATE INDEX idx_keygen_sessions_org_id ON keygen_sessions(org_id);
CREATE INDEX idx_keygen_sessions_status ON keygen_sessions(status);
CREATE INDEX idx_keygen_sessions_expires_at ON keygen_sessions(expires_at);

-- Keygen Participants
CREATE TABLE keygen_participants (
  participant_id UUID PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES keygen_sessions(session_id),
  device_id UUID NOT NULL,
  role VARCHAR(20) NOT NULL,
  signer_index INT NOT NULL,
  device_public_key TEXT NOT NULL,
  device_os VARCHAR(20),
  device_os_version VARCHAR(50),
  app_version VARCHAR(50),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  connection_status VARCHAR(20),
  reported_address VARCHAR(42)
);

CREATE INDEX idx_keygen_participants_session_id ON keygen_participants(session_id);
CREATE INDEX idx_keygen_participants_device_id ON keygen_participants(device_id);

-- Audit Events
CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  org_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  session_id UUID,
  device_id UUID,
  user_id VARCHAR(255),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  details JSONB
);

CREATE INDEX idx_audit_events_org_id ON audit_events(org_id);
CREATE INDEX idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX idx_audit_events_timestamp ON audit_events(timestamp);