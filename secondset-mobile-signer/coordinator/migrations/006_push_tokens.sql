-- Migration 006: Push notification token registry
-- Stores Expo push tokens for registered mobile devices.
-- Used by PushNotificationService to deliver signing request notifications.

CREATE TABLE IF NOT EXISTS device_push_tokens (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  org_id VARCHAR(255) NOT NULL,
  push_token TEXT NOT NULL,
  platform VARCHAR(20),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(device_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_org_id ON device_push_tokens(org_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_device_id ON device_push_tokens(device_id);
