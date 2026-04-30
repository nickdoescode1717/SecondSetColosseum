// coordinator/src/types/index.ts

// ============================================================================
// CHAIN & CURVE TYPES
// ============================================================================

export type ChainType = 'EVM' | 'SOLANA';
export type CurveType = 'secp256k1' | 'ed25519';

/** Derive the curve type from the chain */
export function curveForChain(chain: ChainType): CurveType {
  return chain === 'SOLANA' ? 'ed25519' : 'secp256k1';
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateKeygenSessionRequest {
  org_id: string;
  admin_user_id: string;
  initiated_by_ip: string;
  chain?: ChainType;       // defaults to 'EVM'
  vault_id?: string;        // pre-generated UUID from web app
  role_assignments: {
    cfo: { user_id: string };
    controller: { user_id: string };
    backup: { user_id: string };
  };
}

export interface CreateKeygenSessionResponse {
  session_id: string;
  join_token: string;
  qr_code_data: string;
  short_code: string;
  expiry: string;
  status: KeygenSessionStatus;
}

export interface JoinKeygenSessionRequest {
  join_token: string;
  device_id: string;
  role: SignerRole;
  device_public_key: string;
  device_info: DeviceInfo;
}

export interface JoinKeygenSessionResponse {
  participant_id: string;
  signer_index: 1 | 2 | 3;
  ws_url: string;
  ws_token: string;
  org_name: string;
  session_expiry: string;
}

// ============================================================================
// DOMAIN TYPES
// ============================================================================

export type SignerRole = 'cfo' | 'controller' | 'backup';

export type KeygenSessionStatus =
  | 'created'
  | 'waiting_for_participants'
  | 'all_joined'
  | 'in_progress'
  | 'complete'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type SigningSessionStatus =
  | 'created'
  | 'waiting_for_signers'
  | 'ready'
  | 'in_progress'
  | 'complete'
  | 'failed'
  | 'expired';

export type ConnectionStatus = 'connected' | 'disconnected';

export interface DeviceInfo {
  os: 'iOS' | 'Android';
  os_version: string;
  app_version: string;
}

// ============================================================================
// WEBSOCKET MESSAGE TYPES
// ============================================================================

export type WSMessageType =
  | 'connected'
  | 'keygen_start'
  | 'keygen_round'
  | 'keygen_complete'
  | 'keygen_success'
  | 'keygen_failed'
  | 'keygen_cancelled'
  | 'signing_start'
  | 'sign_round'
  | 'sign_complete'
  | 'signing_success'
  | 'signing_failed'
  | 'recovery_start'
  | 'recovery_round'
  | 'recovery_complete'
  | 'recovery_success'
  | 'recovery_failed'
  | 'recovery_cancelled'
  | 'ping'
  | 'pong';

export interface WSMessage {
  type: WSMessageType;
  [key: string]: any;
}

// Client → Server messages
export interface KeygenRoundMessage extends WSMessage {
  type: 'keygen_round';
  from_participant: string;
  to_participant: string;
  round: number;
  payload: string;
  timestamp: string;
}

export interface KeygenCompleteMessage extends WSMessage {
  type: 'keygen_complete';
  participant_id: string;
  public_key_share: string;
  wallet_address: string;
  completed_at: string;
}

// Server → Client messages
export interface ConnectedMessage extends WSMessage {
  type: 'connected';
  participant_id: string;
  session_id: string;
  your_index: 1 | 2 | 3;
}

export interface KeygenStartMessage extends WSMessage {
  type: 'keygen_start';
  participants: Array<{
    participant_id: string;
    index: 1 | 2 | 3;
    role: SignerRole;
  }>;
  protocol_version: string;
  curve_type: CurveType;
}

export interface KeygenSuccessMessage extends WSMessage {
  type: 'keygen_success';
  wallet_address: string;
  public_key: string;
  session_id: string;
}

export interface KeygenFailedMessage extends WSMessage {
  type: 'keygen_failed';
  reason: 'timeout' | 'participant_dropped' | 'address_mismatch' | 'protocol_error';
  details: string;
}

// ============================================================================
// DATABASE MODELS
// ============================================================================

export interface KeygenSession {
  session_id: string;
  org_id: string;
  admin_user_id: string;
  status: KeygenSessionStatus;
  join_token: string;
  short_code: string;
  chain: ChainType;
  curve_type: CurveType;
  vault_id?: string;
  created_at: Date;
  expires_at: Date;
  started_at?: Date;
  completed_at?: Date;
  wallet_address?: string;
  public_key?: string;
  error_code?: string;
  error_message?: string;
}

export interface KeygenParticipant {
  participant_id: string;
  session_id: string;
  device_id: string;
  role: SignerRole;
  signer_index: 1 | 2 | 3;
  device_public_key: string;
  device_os?: string;
  device_os_version?: string;
  app_version?: string;
  joined_at: Date;
  last_seen_at?: Date;
  connection_status?: ConnectionStatus;
  reported_address?: string;
}

export interface AuditEvent {
  id: number;
  org_id: string;
  event_type: string;
  session_id?: string;
  device_id?: string;
  user_id?: string;
  timestamp: Date;
  ip_address?: string;
  details?: Record<string, any>;
}

// ============================================================================
// SIGNING SESSION TYPES
// ============================================================================

export interface TransactionDetails {
  to: string;
  value: string;
  token?: string;
  data?: string;
  chainId?: number;
  nonce?: number;
  gasLimit?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
}

export interface SigningSession {
  session_id: string;
  org_id: string;
  wallet_address: string;
  request_id: string;
  tx_digest: string;
  tx_details: TransactionDetails;
  required_signers: number;
  chain: ChainType;
  curve_type: CurveType;
  vault_id?: string;
  status: SigningSessionStatus;
  created_at: Date;
  expires_at: Date;
  started_at?: Date;
  completed_at?: Date;
  signature?: { r: string; s: string; v?: number; R?: string };
  tx_hash?: string;
  error_code?: string;
  error_message?: string;
}

export interface SigningParticipant {
  participant_id: string;
  session_id: string;
  device_id: string;
  role: SignerRole;
  signer_index: 1 | 2 | 3;
  biometric_verified: boolean;
  joined_at: Date;
  last_seen_at?: Date;
  connection_status?: ConnectionStatus;
  nonce_point?: string;
  partial_signature?: string;
  completed_at?: Date;
}

// WebSocket message types for signing ceremony

export interface SignRoundMessage extends WSMessage {
  type: 'sign_round';
  from_participant: string;
  to_participant: string;
  round: number;
  payload: string;
  timestamp: string;
}

export interface SignCompleteMessage extends WSMessage {
  type: 'sign_complete';
  participant_id: string;
  partial_signature: string;
  nonce_point: string;
}

export interface SigningStartMessage extends WSMessage {
  type: 'signing_start';
  participants: Array<{
    participant_id: string;
    index: 1 | 2 | 3;
    role: SignerRole;
  }>;
  tx_digest: string;
  tx_details: TransactionDetails;
  protocol_version: string;
  curve_type: CurveType;
}

export interface SigningSuccessMessage extends WSMessage {
  type: 'signing_success';
  signature: { r?: string; s: string; v?: number; R?: string };
  tx_hash?: string;
  session_id: string;
}

export interface SigningFailedMessage extends WSMessage {
  type: 'signing_failed';
  reason: 'timeout' | 'participant_dropped' | 'signature_mismatch' | 'protocol_error';
  details: string;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface JWTPayload {
  sub: string;
  session_id: string;
  role: SignerRole;
  org_id?: string;
  exp: number;
  iat: number;
  jti: string;
}

export interface AuthContext {
  participant_id: string;
  session_id: string;
  role: SignerRole;
  device_id: string;
}

// ============================================================================
// RECOVERY SESSION TYPES
// ============================================================================

export type RecoverySessionStatus =
  | 'open'
  | 'locked'
  | 'in_progress'
  | 'verifying'
  | 'complete'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type RecoveryParticipantType = 'old_signer' | 'new_signer';

export interface ThresholdPolicy {
  formula: 'ceil_2n_3';
  min_threshold: number;
  allow_m_one: boolean;       // reserved for future; must be false for now
  override_m?: number | null; // explicit override (requires audit log entry)
}

export interface RecoverySession {
  session_id: string;
  org_id: string;
  vault_id: string;
  wallet_address: string;
  chain: ChainType;
  curve_type: CurveType;
  admin_user_id: string;
  initiated_by_ip?: string;
  reason?: string;
  status: RecoverySessionStatus;
  join_token: string;
  short_code: string;
  threshold_policy: ThresholdPolicy;
  old_threshold: number;
  computed_old_n?: number;
  computed_new_n?: number;
  computed_m?: number;
  expires_at: Date;
  locked_at?: Date;
  started_at?: Date;
  verifying_at?: Date;
  completed_at?: Date;
  error_code?: string;
  error_message?: string;
  recovery_record?: Record<string, any>;
  created_at: Date;
}

export interface RecoveryParticipant {
  participant_id: string;
  session_id: string;
  device_id: string;
  participant_type: RecoveryParticipantType;
  role: string;
  old_signer_index?: number;
  new_signer_index?: number;
  device_public_key: string;
  device_os?: string;
  device_os_version?: string;
  app_version?: string;
  biometric_verified: boolean;
  joined_at: Date;
  last_seen_at?: Date;
  connection_status?: string;
  reported_address?: string;
  recovery_completed: boolean;
  old_share_deletion_confirmed?: boolean;
  completed_at?: Date;
}

export interface CreateRecoverySessionRequest {
  org_id: string;
  vault_id: string;
  wallet_address: string;
  chain: ChainType;
  curve_type?: CurveType;
  admin_user_id: string;
  initiated_by_ip?: string;
  reason?: string;
  threshold_policy?: Partial<ThresholdPolicy>;
  old_threshold?: number;
}

export interface CreateRecoverySessionResponse {
  session_id: string;
  join_token: string;
  qr_code_data: string;
  short_code: string;
  status: RecoverySessionStatus;
  expires_at: string;
}

export interface JoinRecoverySessionRequest {
  join_token: string;
  device_id: string;
  participant_type: RecoveryParticipantType;
  role: string;
  device_public_key: string;
  device_info: DeviceInfo;
  biometric_verified: boolean;
  old_signer_index?: number; // from stored key share (for old_signer)
}

export interface JoinRecoverySessionResponse {
  participant_id: string;
  participant_type: RecoveryParticipantType;
  old_signer_index?: number;
  new_signer_index?: number;
  ws_url: string;
  ws_token: string;
  vault_address: string;
  session_expiry: string;
  chain: ChainType;
  curve_type: CurveType;
}

// ============================================================================
// RECOVERY WEBSOCKET MESSAGE TYPES
// ============================================================================

export interface RecoveryStartMessage extends WSMessage {
  type: 'recovery_start';
  old_signers: Array<{
    participant_id: string;
    old_signer_index: number;
    device_public_key: string;
  }>;
  new_signers: Array<{
    participant_id: string;
    new_signer_index: number;
    device_public_key: string;
  }>;
  old_t: number;
  new_t: number;
  new_n: number;
  curve_type: CurveType;
  wallet_address: string;
  protocol_version: string;
}

export interface RecoveryRoundMessage extends WSMessage {
  type: 'recovery_round';
  from_participant: string;
  to_participant: string | null; // null = broadcast
  round: number;
  payload: string; // opaque crypto data
  timestamp: string;
}

export interface RecoveryCompleteMessage extends WSMessage {
  type: 'recovery_complete';
  participant_id: string;
  participant_type: RecoveryParticipantType;
  reported_address?: string;           // new_signers report their derived address
  share_deletion_confirmed?: boolean;  // old_signers confirm deletion
}

export interface RecoverySuccessMessage extends WSMessage {
  type: 'recovery_success';
  wallet_address: string;
  new_threshold: number;
  new_n: number;
  revoke_old_shares: boolean;
  ceremony_timestamp: string;
}

export interface RecoveryFailedMessage extends WSMessage {
  type: 'recovery_failed';
  reason: 'timeout' | 'participant_dropped' | 'address_mismatch' | 'verification_failed' | 'protocol_error';
  details: string;
}

export interface RecoveryCancelledMessage extends WSMessage {
  type: 'recovery_cancelled';
  reason: string;
}