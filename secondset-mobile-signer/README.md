# SecondSet Mobile Signer

Mobile signer application and coordinator service for SecondSet treasury wallet management.  
Implements a **2-of-3 threshold signature scheme** supporting both **ECDSA (secp256k1/EVM)** and **EdDSA (Ed25519/Solana)**, with full vault recovery via proactive resharing.

---

## Project Structure

```
secondset-mobile-signer/
├── coordinator/                    # Node.js/TypeScript backend service
│   ├── src/
│   │   ├── middleware/             # API key auth, rate limiting
│   │   ├── routes/                 # keygen, signing, recovery REST handlers
│   │   ├── services/               # DatabaseService, WebSocketManager, WebhookService
│   │   ├── types/                  # Shared TypeScript types and interfaces
│   │   └── server.ts               # Express + WebSocket server entry point
│   ├── migrations/                 # PostgreSQL schema migration files
│   │   ├── 001_initial_schema.sql  # keygen_sessions, keygen_participants, audit_events
│   │   ├── 002_signing_tables.sql  # signing_sessions, signing_participants
│   │   ├── 003_add_chain_curve.sql # chain + curve_type columns on all session tables
│   │   ├── 004_widen_tx_digest.sql # Widen tx_digest for Solana message hex
│   │   └── 005_recovery_tables.sql # recovery_sessions, recovery_participants
│   ├── .env.example
│   └── package.json
│
└── mobile-signer/                  # React Native (Expo) mobile application
    ├── src/
    │   ├── navigation/             # AppNavigator (root stack) + TabNavigator (bottom tabs)
    │   ├── screens/                # All UI screens (see Screens section)
    │   ├── services/               # CoordinatorAPI, CoordinatorWS, SecureStorage, TSS, BiometricAuth
    │   │   └── TSS/                # CryptoFactory, TSSCrypto, Ed25519Crypto, RecoveryCrypto
    │   └── store/                  # Zustand stores: auth, vault, pending, ceremony
    ├── app.json
    └── package.json
```

---

## Features

### Coordinator Service
- REST API for keygen, signing, and recovery session management
- WebSocket server for real-time multi-party ceremony coordination
- Automatic ceremony orchestration (triggers on participant threshold)
- Signature aggregation: Lagrange interpolation (secp256k1) and scalar summation (Ed25519)
- Webhook delivery to web app with HMAC-SHA256 authentication and retry logic
- PostgreSQL persistence for sessions, participants, and audit logs
- JWT authentication for all WebSocket connections (15-min expiry)
- API key authentication + per-IP rate limiting (50 req/min)
- Session cancellation with live WebSocket broadcast to connected devices

### Mobile App
- QR code scanning for keygen and recovery ceremony enrollment
- Auto-detection of old vs. new signer during vault recovery (by SecureStorage lookup)
- Multi-vault key share storage with per-vault secure storage keys
- Hardware-backed secure storage: iOS Secure Enclave / Android Keystore
- Biometric authentication required before any signing operation
- Threshold ECDSA over secp256k1 (EVM/Ethereum) — full Feldman VSS DKG + partial signing
- Threshold EdDSA over Ed25519 (Solana) — full Feldman VSS DKG + partial signing
- Vault recovery via proactive resharing: ECIES device-to-device encryption + Feldman VSS verification
- Pending signing request polling (10-second interval) with Activity tab badge
- CryptoFactory dispatch: secp256k1 vs Ed25519 resolved at runtime from QR/session data

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS only) or Android Emulator

### Coordinator Setup

```bash
cd coordinator

# Install dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your values (see Environment Variables section)

# Create the database
createdb secondset_coordinator

# Run all migrations in order
psql -U postgres -d secondset_coordinator -f migrations/001_initial_schema.sql
psql -U postgres -d secondset_coordinator -f migrations/002_signing_tables.sql
psql -U postgres -d secondset_coordinator -f migrations/003_add_chain_curve.sql
psql -U postgres -d secondset_coordinator -f migrations/004_widen_tx_digest.sql
psql -U postgres -d secondset_coordinator -f migrations/005_recovery_tables.sql

# Start development server (hot reload via nodemon)
npm run dev
# Server starts on PORT from .env (default: 3000)
```

### Mobile App Setup

```bash
cd mobile-signer

# Install dependencies
npm install

# Start Expo dev server
npm start

# Open on device/simulator
# Press 'i' for iOS simulator
# Press 'a' for Android emulator
# Press 'w' for web browser
```

---

## Environment Variables

### Coordinator (`.env`)

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/secondset_coordinator` |
| `JWT_SECRET` | Secret for WebSocket JWT tokens (min 32 bytes) | `openssl rand -base64 32` |
| `PORT` | HTTP/WebSocket server port | `3000` |
| `NODE_ENV` | Runtime environment | `development` \| `production` |
| `WEBAPP_WEBHOOK_URL` | Web app webhook endpoint | `http://localhost:3002/api/coordinator/webhook` |
| `COORDINATOR_WEBHOOK_SECRET` | HMAC secret for webhook signing (32 hex bytes) | `openssl rand -hex 32` |
| `COORDINATOR_API_KEY` | API key required on all coordinator requests | `openssl rand -hex 32` |

### Mobile App
No `.env` file required. The coordinator URL is configured directly in `src/services/CoordinatorAPI.ts`. Update it for each deployment environment.

---

## API Reference

All endpoints require the `x-api-key` header matching `COORDINATOR_API_KEY`.

### Keygen Endpoints

#### Create Keygen Session
```
POST /api/v1/keygen/sessions
```
Body: `org_id`, `admin_user_id`, `chain` (EVM|SOLANA), `vault_id`, `role_assignments`, `initiated_by_ip`  
Returns: `session_id`, `join_token`, `qr_code_data`, `short_code`, `expiry`  
QR data contains: `session_id`, `org_id`, `join_token`, `chain`, `curve_type`, `vault_id`  
Session expires after **10 minutes**.

#### Join Keygen Session
```
POST /api/v1/keygen/sessions/:session_id/join
```
Body: `join_token`, `device_id`, `role` (cfo|controller|backup), `device_public_key`, `device_info`  
Returns: `participant_id`, `signer_index` (1–3), `ws_url`, `ws_token` (JWT, 15-min expiry)  
Each role may only join once per session. Max 3 participants.

#### Get Session Status
```
GET /api/v1/keygen/sessions/:session_id/status
```
Returns session status, participants array, current round, result.

#### Cancel Keygen Session
```
POST /api/v1/keygen/sessions/:session_id/cancel
```
Broadcasts `keygen_cancelled` to all connected devices, closes WebSocket connections.

---

### Signing Endpoints

#### Create Signing Session
```
POST /api/v1/signing/sessions
```
Body: `wallet_address`, `tx_digest`, `tx_details`, `required_signers: 2`  
Returns: `session_id`, `join_token`, `qr_code_data`, `expiry`  
Session expires after **30 minutes**.

#### Join Signing Session
```
POST /api/v1/signing/sessions/:session_id/join
```
Body: `join_token`, `device_id`, `role`, `device_public_key`, `device_info`  
Returns: `participant_id`, `signer_index`, `ws_token`

#### Get Pending Sessions (Mobile Polling)
```
GET /api/v1/signing/sessions/pending?wallet_address=<address>
```
Returns all pending signing sessions for a wallet address. Polled every 10 seconds by mobile app.

#### Get Session Status
```
GET /api/v1/signing/sessions/:session_id
```

---

### Recovery Endpoints

#### Create Recovery Session
```
POST /api/v1/recovery/sessions
```
Body: `org_id`, `vault_id`, `wallet_address`, `chain`, `admin_user_id`, `reason`, `initiated_by_ip`  
Optional: `old_threshold`, `threshold_policy` (`{formula, min_threshold, allow_m_one}`)  
Returns: `session_id`, `join_token`, `qr_code_data`, `short_code`, `expires_at`  
QR data contains: `type: "recovery"`, `session_id`, `join_token`, `vault_id`, `wallet_address`, `chain`, `curve_type`  
Session expires after **2 hours**.

#### Join Recovery Session
```
POST /api/v1/recovery/sessions/:sessionId/join
```
Body: `join_token`, `device_id`, `participant_type` (old_signer|new_signer), `role`, `device_public_key`, `device_info`  
Returns: `participant_id`, `signer_index` (new signers only), `ws_token`

#### Lock Recovery Session
```
POST /api/v1/recovery/sessions/:sessionId/lock
```
Called by web app when admin clicks "Lock & Start Recovery". Computes threshold `m = max(2, ceil(2n/3))`, broadcasts `recovery_start` to all connected devices.

#### Get Recovery Session Status
```
GET /api/v1/recovery/sessions/:sessionId
```

#### Cancel Recovery Session
```
POST /api/v1/recovery/sessions/:sessionId/cancel
```

---

## WebSocket Protocol

**Endpoint**: `ws://<host>/ws?token=<jwt>`

JWT payload: `{ sub: participant_id, session_id, role, org_id, jti }` — signed with `JWT_SECRET`, 15-min expiry.

### Client → Server Messages

| Type | Description |
|---|---|
| `ping` | Heartbeat keepalive |
| `keygen_round` | DKG round data: `from_participant`, `to_participant`, `round`, `payload` |
| `keygen_complete` | DKG finished: `participant_id`, `wallet_address`, `public_key_share` |
| `sign_round` | Signing round data: `from_participant`, `to_participant`, `round`, `payload` |
| `sign_complete` | Signing finished: `participant_id`, `partial_signature`, `nonce_point` |
| `recovery_round` | Resharing data: `from_participant`, `to_participant`, `round`, `payload` |
| `recovery_complete` | Recovery finished: `participant_id`, `participant_type`, `reported_address` |

### Server → Client Messages

| Type | Trigger |
|---|---|
| `connected` | On successful WebSocket auth |
| `pong` | Response to `ping` |
| `keygen_start` | All 3 participants connected — includes `participants[]`, `curve_type` |
| `keygen_success` | Address consensus reached — includes `wallet_address`, `public_key` |
| `keygen_failed` | Consensus failed or error |
| `keygen_cancelled` | Admin cancelled the session |
| `signing_start` | Required signers connected |
| `signing_success` | Signature aggregated successfully |
| `signing_failed` | Aggregation failed |
| `recovery_start` | Session locked — includes all participant public keys and indices |
| `recovery_round` | Relayed sub-share/commitment messages |
| `recovery_success` | All new signers report same address |
| `recovery_failed` | Consensus failed or error |
| `recovery_cancelled` | Admin cancelled the recovery |

---

## Cryptographic Architecture

### Supported Curves

| Chain | Curve | Algorithm | Address Derivation |
|---|---|---|---|
| EVM (Ethereum, Base, etc.) | secp256k1 | Threshold ECDSA | keccak256(pubkey)[12:] → 0x prefixed hex |
| Solana | Ed25519 | Threshold EdDSA | base58(32-byte public key) |

Curve type is resolved from QR code data or session metadata — never inferred from address format alone.

### Distributed Key Generation (DKG)

Both curves use Feldman Verifiable Secret Sharing (VSS):

1. **Round 1** — Each signer generates a random secret polynomial of degree 1 (for 2-of-3), computes Feldman commitments `[C0, C1]`, and evaluates the polynomial at each other signer's index to produce encrypted shares.
2. **Round 2** — Each signer verifies received shares against the commitments (`share * G == C0 + index * C1`), then sums all received shares to compute their final key share. The combined public key is the sum of all `C0` commitments.

**secp256k1**: Implemented in `TSSCrypto.ts` using `@noble/secp256k1`.  
**Ed25519**: Implemented in `Ed25519Crypto.ts` using `@noble/curves/ed25519`.

### Threshold Signing

**secp256k1 (ECDSA)** — 2-of-3:
- Each signer generates ephemeral nonce `k_i` and publishes `R_i = k_i * G`
- Coordinator combines nonce points: `R = R_1 + R_2` (EC point addition)
- Each signer creates partial signature: `s_i = k_i^{-1} * (H(m) + r * share_i) mod n`
- Coordinator reconstructs via Lagrange interpolation: `s = Lagrange(s_1, s_2)`

**Ed25519 (EdDSA)** — 2-of-3:
- Each signer pre-multiplies their share by their Lagrange coefficient before signing
- Nonce scalars are NOT shared between signers (unlike secp256k1 variant)
- Coordinator sums partial signatures: `s = s_1 + s_2 mod l`
- Final signature: `R (32 bytes) || s (32 bytes)` = 64 bytes total

### Vault Recovery (Proactive Resharing)

When signers lose devices or key rotation is needed, recovery redistributes key shares to a new committee without ever reconstructing or exposing the group secret:

1. Old signers create a degree-(m-1) polynomial with their existing key share as the constant term
2. The polynomial is evaluated at each new signer's index to produce sub-shares
3. Sub-shares are **ECIES-encrypted device-to-device** — the coordinator routes ciphertext and never sees plaintext
4. Old signers broadcast Feldman commitments to all participants
5. New signers decrypt their sub-shares, **verify against commitments** (Feldman VSS), then Lagrange-interpolate their new key share
6. Each new signer derives the wallet address from the combined public key and verifies it matches the vault — guaranteeing the resharing preserved the same group key

**ECIES implementation**: ECDH → SHA-256 key derivation → XOR (one-time pad, safe because sub-shares are exactly 32 bytes) → HMAC-SHA256 authentication tag. Separate implementations for secp256k1 and Ed25519 in `RecoveryCrypto.ts`.

**Threshold formula**: `m = max(2, ceil(2 * n / 3))` where `n` = number of new signers. Hard floor of `m >= 2` always enforced.

**Implemented in**:
- `mobile-signer/src/services/TSS/RecoveryCrypto.ts` — `OldSignerReshare*` and `NewSignerReshare*` classes for both curves
- `mobile-signer/src/services/TSS/CryptoFactory.ts` — dispatches to curve-correct implementation
- `coordinator/src/routes/recovery.routes.ts` — REST endpoints
- `coordinator/src/services/WebSocketManager.ts` — `recovery_start` orchestration, consensus verification

---

## Mobile App Screens

### Tab Navigation

| Tab | Icon | Screen(s) |
|---|---|---|
| Vaults | wallet-outline | `VaultListScreen` → `VaultDetailScreen` |
| Add Vault | add-circle-outline | `EnrollScreen` (QR scanner) |
| Activity | pulse-outline | `ActivityScreen` (pending requests + badge) |

### Keygen Ceremony Flow (full-screen, no swipe-back)

`EnrollScreen` (QR scan detects no `type` field) → `JoinCeremonyScreen` (role select + expiry countdown) → `CeremonyLobbyScreen` (waiting for all 3) → `CeremonyProgressScreen` (3 DKG rounds, shows wallet address on success) → `CeremonyDoneScreen` → back to Vaults tab

### Signing Flow (full-screen, no swipe-back)

`ActivityScreen` (polls pending sessions, shows badge count) → `SigningRequestScreen` (tx details + biometric auth) → `SigningProgressScreen` (2-of-3 threshold signing) → `SigningCompleteScreen` → back to Activity tab

### Recovery Flow (full-screen, no swipe-back)

`EnrollScreen` (QR scan detects `type: "recovery"`) → `RecoveryJoinScreen` (auto-detects old/new signer via SecureStorage; old signers biometric-auth; new signers select role; generates ECIES device keypair) → `RecoveryProgressScreen` (executes resharing protocol via WebSocket; Feldman VSS verification; address consensus) → `RecoveryDoneScreen` (different message for old vs. new signers) → back to Vaults tab

---

## State Management (Zustand Stores)

| Store | State | Purpose |
|---|---|---|
| `authStore` | `user`, `setUser()`, `clearUser()` | User session across the app |
| `vaultStore` | `vaults[]`, `loadVaults()`, `addVault()`, `removeVault()` | Multi-vault key share registry |
| `pendingStore` | `pendingCount`, `setPendingCount()` | Activity tab badge count |
| `ceremonyStore` | participant info, ceremony status, wallet address | Active ceremony session data |

---

## Secure Storage (Multi-Vault)

Each key share is stored as a `VaultKeyShare` object keyed by vault ID:

```typescript
interface VaultKeyShare {
  vault_id: string;
  share: string;             // hex-encoded scalar
  participant_id: string;
  org_id: string;
  role: string;              // cfo | controller | backup
  wallet_address: string;
  chain: string;             // EVM | SOLANA
  curve_type: string;        // secp256k1 | ed25519
  signer_index: number;      // 1 | 2 | 3
  created_at: string;
}
```

Storage keys: `secondset_vault_index` (JSON array of vault IDs in AsyncStorage) + `secondset_vault_{id}` (serialized `VaultKeyShare` in Expo SecureStore).

Legacy single-vault migration runs automatically on `LoginScreen` mount (idempotent).

Lookup by wallet address (`getVaultKeyShareByAddress`) is used for signing and recovery auto-detection.

---

## Database Schema

### `keygen_sessions`
`session_id` (UUID PK), `org_id`, `admin_user_id`, `status`, `join_token`, `short_code`, `chain`, `curve_type`, `vault_id`, `expires_at`, `wallet_address`, `public_key`, `error_code`, `error_message`, `created_at`

### `keygen_participants`
`participant_id` (UUID PK), `session_id` (FK), `device_id`, `role`, `signer_index`, `device_public_key`, `device_info` (JSONB), `joined_at`, `connection_status`, `reported_address`

### `signing_sessions`
Same structure as `keygen_sessions` plus `tx_digest`, `tx_details` (JSONB), `required_signers`, `signature_r`, `signature_s`

### `signing_participants`
Same structure as `keygen_participants` plus `partial_signature`, `nonce_point`

### `recovery_sessions`
`session_id` (UUID PK), `org_id`, `vault_id`, `wallet_address`, `chain`, `curve_type`, `admin_user_id`, `reason`, `status` (open → locked → in_progress → verifying → complete|failed|expired|cancelled), `join_token`, `short_code`, `threshold_policy` (JSONB), `old_threshold`, `computed_old_n`, `computed_new_n`, `computed_m`, `expires_at`, `recovery_record` (JSONB), `created_at`

### `recovery_participants`
`participant_id` (UUID PK), `session_id` (FK), `device_id`, `participant_type` (old_signer|new_signer), `role`, `old_signer_index`, `new_signer_index`, `device_public_key`, `biometric_verified`, `connection_status`, `reported_address`, `recovery_completed`, `old_share_deletion_confirmed`, `joined_at`

### `audit_events`
`id` (BIGSERIAL PK), `org_id`, `event_type`, `session_id`, `device_id`, `user_id`, `timestamp`, `ip_address`, `details` (JSONB)

---

## Session Status Flows

```
Keygen:   waiting_for_participants → in_progress → complete | failed | expired | cancelled

Signing:  waiting_for_signers → ready → in_progress → complete | failed | expired

Recovery: open → locked → in_progress → verifying → complete | failed | expired | cancelled
```

---

## Webhook Events

The coordinator delivers signed webhooks to the web app on ceremony completion:

| Event | Payload |
|---|---|
| `keygen.completed` | `wallet_address`, `public_key` |
| `keygen.failed` | `error`, `reason` |
| `signing.completed` | `r`, `s` (secp256k1) or `R`, `s` (Ed25519) |
| `signing.failed` | `error` |
| `recovery.completed` | `new_threshold`, `new_n`, `recovery_record` |
| `recovery.failed` | `error` |

Authentication: `X-Coordinator-Signature: HMAC-SHA256(timestamp + "." + body, COORDINATOR_WEBHOOK_SECRET)` + `X-Coordinator-Timestamp` headers. 3 delivery attempts with exponential backoff.

---

## NPM Scripts

### Coordinator

| Script | Command |
|---|---|
| `npm run dev` | Start with nodemon hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run production build |
| `npm test` | Run Jest test suite |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

### Mobile App

| Script | Command |
|---|---|
| `npm start` | Start Expo dev server |
| `npm run ios` | Open on iOS simulator |
| `npm run android` | Open on Android emulator |
| `npm run web` | Open in browser |
| `npm test` | Run Jest test suite |

---

## Testing

### Unit Tests
- `mobile-signer/src/services/TSS/__tests__/Ed25519Crypto.test.ts` — Ed25519 DKG + signing correctness
- Coordinator: Jest configured, integration tests for WebSocket routing and session transitions

### End-to-End: Keygen
1. Start coordinator: `cd coordinator && npm run dev`
2. Create a keygen session (or use web app) → get QR code
3. Open mobile app on 3 devices/simulators, scan QR, select different roles
4. Watch DKG ceremony progress across all devices
5. Verify all 3 devices show the same wallet address

### End-to-End: Signing
1. Ensure a vault exists from completed keygen
2. Create signing session with a `tx_digest` via the web app
3. Two mobile devices poll and discover the pending session
4. Both authenticate with biometrics and join
5. Verify coordinator aggregates and delivers webhook with `(r, s)` signature

### End-to-End: Vault Recovery
1. Ensure a vault exists with key shares on at least 2 devices (old signers)
2. Admin initiates recovery from web app → QR code displayed
3. 2+ old signer devices and 1+ new signer devices scan the QR
4. Old signers authenticate with biometrics; new signers select roles
5. Admin locks the session; watch resharing protocol execute
6. Verify all new signer devices show the same wallet address matching the original vault
7. Verify web app receives `recovery.completed` webhook
8. Optionally: submit a new signing request to confirm the recovered shares work

---

## Security Properties

- Private keys **never leave mobile devices** — stored in iOS Secure Enclave or Android Keystore
- Coordinator is **cryptographically stateless** — routes ciphertext only, never sees key material
- During recovery, sub-shares are **ECIES-encrypted device-to-device** before passing through coordinator
- **Feldman VSS** commitments allow new signers to verify sub-shares without trusting any single old signer
- **Address consensus** — all new signers must derive the same address matching the known vault, preventing silent corruption
- **Biometric authentication** required before accessing any key share
- JWT tokens for WebSocket connections expire after 15 minutes
- Session expiry: 10 min (keygen), 30 min (signing), 2 hours (recovery)
- API key + per-IP rate limiting (50 req/min) on all coordinator endpoints
- Webhook HMAC-SHA256 authentication prevents spoofed callbacks
- Comprehensive audit logging for all operations

---

## Production Deployment Checklist

- [ ] Set `NODE_ENV=production` on coordinator
- [ ] Use HTTPS for all coordinator endpoints (update mobile app URL)
- [ ] Restrict CORS to web app domain only
- [ ] Rotate `COORDINATOR_API_KEY` quarterly
- [ ] Generate `JWT_SECRET` with at least 32 cryptographically random bytes
- [ ] Enable PostgreSQL SSL (`?sslmode=require` in `DATABASE_URL`)
- [ ] Set up daily database backups with 30-day retention
- [ ] Monitor WebSocket connection drops and failed ceremony counts
- [ ] Alert on 3+ consecutive webhook delivery failures
- [ ] Verify ECIES curve implementations are curve-matched (secp256k1 vs Ed25519) in recovery sessions

---

## License

PROPRIETARY — SecondSet
