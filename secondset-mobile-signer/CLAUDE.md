# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SecondSet Mobile Signer is a threshold signature system for treasury wallet management, supporting both ECDSA (secp256k1/EVM) and EdDSA (Ed25519/Solana). It consists of two main components:

- **Coordinator** (Node.js/TypeScript): Stateless message router with WebSocket coordination - holds NO key material. Orchestrates keygen, signing, and recovery ceremonies.
- **Mobile App** (React Native/Expo): Holds encrypted key shares in device Secure Enclave/Keystore. Performs DKG, threshold signing, and proactive resharing for vault recovery.

**Security Model**: Private keys NEVER leave mobile devices. Coordinator only routes messages between participants during ceremonies. During recovery, sub-shares are encrypted device-to-device via ECIES — the coordinator never sees plaintext key material.

## Repository Structure

```
secondset-mobile-signer/
├── coordinator/           # Backend service
│   ├── src/
│   │   ├── services/     # DatabaseService, WebSocketManager, SessionManager
│   │   ├── routes/       # API route handlers
│   │   ├── types/        # Shared TypeScript types
│   │   └── server.ts     # Express + WebSocket entry point
│   ├── migrations/       # PostgreSQL schema files
│   └── package.json
│
└── mobile-signer/        # React Native app
    ├── src/
    │   ├── screens/      # UI screens (Enroll, CeremonyProgress, etc.)
    │   ├── services/     # CoordinatorAPI, CoordinatorWS, TSS, SecureStorage
    │   ├── store/        # Zustand state management
    │   └── navigation/   # React Navigation setup
    └── package.json
```

## Development Commands

### Coordinator Service

```bash
cd coordinator

# Install dependencies
npm install

# Development server (with hot reload)
npm run dev

# Build TypeScript
npm build

# Run tests
npm test

# Run specific test file
npm test -- path/to/test.spec.ts

# Lint
npm run lint

# Format code
npm run format

# Production start
npm start
```

### Mobile App

```bash
cd mobile-signer

# Install dependencies
npm install

# Start Expo dev server
npm start

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Run web version
npm run web

# Run tests
npm test
```

### Database Setup

```bash
# Create database
createdb secondset_coordinator

# Run migration
psql -U postgres -d secondset_coordinator -f coordinator/migrations/001_initial_schema.sql
```

## Architecture

### Coordinator Service

**Core Principle**: The coordinator is completely stateless regarding key material - it only routes messages.

- **server.ts**: Express HTTP server + WebSocket server initialization
- **WebSocketManager**: Handles WebSocket connections, JWT authentication, message routing, and automatic ceremony orchestration
- **DatabaseService**: PostgreSQL operations for sessions, participants, and audit logging
- **SessionManager**: Session lifecycle and state transitions

**Key Flow - Keygen Ceremony**:
1. Admin creates session via `POST /api/v1/keygen/sessions` → generates QR code data
2. 3 participants join via `POST /api/v1/keygen/sessions/:id/join` → receive WebSocket tokens
3. Participants connect to WebSocket with JWT token
4. When all 3 connect, WebSocketManager automatically broadcasts `keygen_start`
5. Participants run DKG protocol, sending encrypted messages via WebSocket
6. Each participant reports completed wallet address via `keygen_complete`
7. WebSocketManager verifies consensus (all 3 addresses match) → broadcasts `keygen_success`
8. Session marked complete in database

**REST API Endpoints**:
- `POST /api/v1/keygen/sessions` - Create keygen session (returns QR code data)
- `POST /api/v1/keygen/sessions/:id/join` - Join keygen session (returns WS token)
- `GET /api/v1/keygen/sessions/:id` - Get keygen session status
- `POST /api/v1/keygen/sessions/:id/cancel` - Cancel active keygen session (broadcasts `keygen_cancelled` to connected devices, closes WS connections)
- `POST /api/v1/signing/sessions` - Create signing session (accepts `wallet_address`, `tx_digest`, `tx_details`, `required_signers`)
- `GET /api/v1/signing/sessions/pending?wallet_address=0x...` - Fetch pending signing sessions for a wallet (used by mobile app polling)
- `GET /api/v1/signing/sessions/:id` - Get signing session status
- `POST /api/v1/signing/sessions/:id/join` - Join signing session (returns WS token)
- `POST /api/v1/recovery/sessions` - Create recovery session (accepts `wallet_address`, `old_threshold`, `old_n`, `new_n`, `min_threshold`, `chain`, `curve_type`, `vault_id`, `webhook_url`)
- `POST /api/v1/recovery/sessions/:id/join` - Join recovery session (accepts `participant_type: 'old_signer' | 'new_signer'`, `device_public_key`, `role`, `biometric_verified`)
- `GET /api/v1/recovery/sessions/:id` - Get recovery session status
- `POST /api/v1/recovery/sessions/:id/cancel` - Cancel active recovery session

**WebSocket Message Types**:
- Client → Server: `ping`, `keygen_round`, `keygen_complete`, `sign_round`, `sign_complete`, `recovery_round`, `recovery_complete`
- Server → Client: `connected`, `pong`, `keygen_start`, `keygen_success`, `keygen_failed`, `keygen_cancelled`, `signing_start`, `signing_success`, `signing_failed`, `recovery_start`, `recovery_round` (relayed), `recovery_success`, `recovery_failed`, `recovery_cancelled`

### Mobile App

**Architecture**: React Native (Expo) with Zustand state management

- **Navigation**: Bottom tab navigation with stack-based ceremony flows (React Navigation v6)
  - **Root Stack** (`RootStackParamList` in `src/navigation/types.ts`):
    - LoginScreen (auth) → MainTabs (tab navigator) → ceremony/signing flows (full-screen)
  - **Main Tabs** (`MainTabParamList`):
    - **Vaults** tab (`wallet-outline` icon) → VaultListScreen → VaultDetailScreen (drill-down)
    - **Add Vault** tab (`add-circle-outline` icon) → EnrollScreen (QR scan)
    - **Activity** tab (`pulse-outline` icon) → ActivityScreen (pending requests + recent activity, with badge for pending count)
  - **Ceremony flows** (outside tabs, full-screen with gestures disabled):
    - EnrollScreen/ManualTestScreen → JoinCeremonyScreen → CeremonyLobbyScreen → CeremonyProgressScreen → CeremonyDoneScreen → back to Vaults tab
  - **Signing flows** (outside tabs, full-screen with gestures disabled):
    - ActivityScreen → SigningRequestScreen → SigningProgressScreen → SigningCompleteScreen → back to Activity tab
  - **Recovery flows** (outside tabs, full-screen with gestures disabled):
    - EnrollScreen (QR scan detects `type: "recovery"`) → RecoveryJoinScreen → RecoveryProgressScreen → RecoveryDoneScreen → back to Vaults tab
  - Native headers with teal (#2D9D92) theme; tab bar is white; ceremony/signing progress/done screens are headerless
  - Type-safe navigation via `RootStackParamList` and `MainTabParamList`

- **Key Screens**:
  - **LoginScreen**: Mock authentication → stores user in `authStore` → navigates to MainTabs
  - **VaultListScreen** (Vaults tab): Displays enrolled vaults grouped by chain (EVM/Solana), pull-to-refresh. Chain resolved from address format (`0x` = EVM, otherwise = Solana).
  - **VaultDetailScreen**: Drill-down showing vault address, role, chain type (resolved from address), with copy/share actions
  - **EnrollScreen** (Add Vault tab): QR scanner for joining keygen ceremonies, camera stops when tab blurs
  - **ActivityScreen** (Activity tab): Welcome greeting, org card, pending signing requests (polls all vaults), recent activity, logout button
  - **JoinCeremonyScreen**: Role selection (CFO/Controller/Backup), ceremony details, expiry countdown
  - **CeremonyProgressScreen**: Real-time DKG progress (3 rounds), displays final wallet address on success
  - **SigningRequestScreen**: Transaction details, biometric authentication prompt before joining
  - **SigningProgressScreen**: Real-time threshold signing ceremony (2-of-3), signature aggregation
  - **RecoveryJoinScreen**: Auto-detects old vs new signer via `SecureStorage.getVaultKeyShareByAddress()`. Old signers see existing role + biometric auth. New signers select role (CFO/Controller/Backup). Generates ECIES device keypair matching vault curve type.
  - **RecoveryProgressScreen**: Executes resharing protocol. Old signers: load key share → generate commitments + encrypted sub-shares → broadcast via WS. New signers: collect sub-shares from all old signers → verify Feldman VSS → interpolate new share → verify address → store in SecureStore.
  - **RecoveryDoneScreen**: Success confirmation. Different messaging for old signers ("Shares Transferred!") vs new signers ("Vault Recovered!"). Shows new threshold, vault address.

- **Services**:
  - **CoordinatorAPI**: REST API client (join session, create signing session, etc.)
  - **CoordinatorWS**: WebSocket client with event emitter pattern, auto-reconnect, heartbeat
  - **TSS/KeygenClient**: Orchestrates DKG ceremony, listens for `keygen_start`, runs TSS crypto
  - **TSS/TSSCrypto**: Real cryptography using `@noble/secp256k1` for threshold ECDSA
  - **SecureStorage**: Wrapper for Expo SecureStore - saves encrypted key shares to device secure storage
  - **BiometricAuth**: Expo LocalAuthentication for biometric verification before signing
  - **TSS/RecoveryCrypto**: Proactive resharing protocol for both secp256k1 and Ed25519. Contains `OldSignerReshareSecp256k1`, `OldSignerReshareEd25519`, `NewSignerReshareSecp256k1`, `NewSignerReshareEd25519` classes. Uses ECIES for device-to-device sub-share encryption. Includes Feldman VSS verification.
  - **TSS/CryptoFactory**: Dispatches to correct crypto implementation based on `CurveType`. Provides `getKeygen()`, `getSigning()`, `getOldSignerReshare()`, `getNewSignerReshare()` factory functions.

- **State Management** (Zustand stores in `src/store/`):
  - **authStore**: User session data (`user`, `setUser()`, `clearUser()`) - replaces passing user via route params
  - **vaultStore**: Multi-vault management (`vaults[]`, `loadVaults()`, `addVault()`, `removeVault()`)
  - **pendingStore**: Pending signing request count (`pendingCount`, `setPendingCount()`) - drives Activity tab badge
  - **ceremonyStore**: Active ceremony session data, participant info, ceremony status, wallet address

**Key Flow - Mobile Keygen**:
1. User taps **Add Vault** tab → EnrollScreen → scans QR code → extracts session_id, join_token, chain, curve_type, vault_id
2. Navigate to JoinCeremonyScreen → user selects role (CFO/Controller/Backup); passes chain/curve_type/vault_id to ceremony store
3. App calls CoordinatorAPI.joinKeygenSession() → receives participant_id, signer_index, ws_token
4. Navigate to CeremonyLobbyScreen → connect to WebSocket via CoordinatorWS
5. When `keygen_start` received (contains authoritative `curve_type`) → CeremonyProgressScreen → `CryptoFactory.getKeygen(curveType)` dispatches to correct DKG implementation
6. Key share generated and stored as `VaultKeyShare` via `SecureStorage.storeVaultKeyShare()`, added to `vaultStore`
7. App reports wallet address to coordinator via `keygen_complete` message
8. When `keygen_success` received → navigate to CeremonyDoneScreen (shows "Ethereum Address" or "Solana Address" based on address format)
9. User taps Done → navigate back to **Vaults** tab
10. If admin cancels session, `keygen_cancelled` WS message received → alert shown → navigate back to MainTabs

**Key Flow - Transaction Signing**:
1. ActivityScreen polls all vault addresses for pending signing sessions (10s interval)
2. Pending requests displayed with badge count on Activity tab
3. User taps request → SigningRequestScreen → authenticate with biometrics
4. **Key share lookup**: `SecureStorage.getVaultKeyShareByAddress(request.wallet_address)` — uses vault-aware lookup, NOT legacy `getKeyShare()`. Logs debug info (searched vs. stored addresses) on failure.
5. Join session → navigate to SigningProgressScreen with `walletAddress` + `curveType` in route params
6. SigningProgressScreen passes both to `signingClient.initialize()` → correct ECDSA/EdDSA dispatch
7. When `signing_success` received → navigate to SigningCompleteScreen
8. User taps Done → navigate back to **Activity** tab

**Key Flow - Vault Recovery (Resharing)**:
1. Admin initiates recovery from web app → coordinator creates recovery session → QR code displayed
2. EnrollScreen detects `type: "recovery"` in QR data → navigates to RecoveryJoinScreen
3. RecoveryJoinScreen auto-detects participant type: checks `SecureStorage.getVaultKeyShareByAddress(wallet_address)` — if found, user is old signer; otherwise, new signer
4. Old signers: shown existing role, biometric auth required. New signers: select role (CFO/Controller/Backup)
5. App generates ECIES device keypair via `generateDeviceKeyPair(curveType)`, calls `CoordinatorAPI.joinRecoverySession()` with `device_public_key`
6. Navigate to RecoveryProgressScreen → connect to WebSocket
7. When `recovery_start` received (contains all participant public keys and indices):
   - **Old signers**: Load key share → `OldSignerReshare.generateRound1(keyShare, newSignerIndices)` → returns `{commitments, encryptedSubShares}` → broadcast commitments to all via `recovery_round` (to_participant='*') → send each encrypted sub-share to individual new signers
   - **New signers**: Register `recovery_round` handler → collect commitments + encrypted sub-shares from all old signers → `NewSignerReshare.processSubShares(encryptedSubShares, commitments, devicePrivateKey, newSignerIndex)` → returns `{newShare, publicKey, walletAddress}` → verify address matches vault → store in SecureStore
8. Both send `recovery_complete` with reported address
9. Coordinator verifies consensus → broadcasts `recovery_success` with `{new_threshold, new_n}`
10. Navigate to RecoveryDoneScreen → user taps Done → back to Vaults tab

### Database Schema

**keygen_sessions**: session_id, org_id, status, join_token, short_code, wallet_address, public_key, timestamps
**keygen_participants**: participant_id, session_id, device_id, role (cfo/controller/backup), signer_index (1/2/3), connection_status, reported_address
**signing_sessions**: Similar structure for transaction signing ceremonies
**recovery_sessions**: session_id, vault_id, wallet_address, chain, curve_type, old_threshold, old_n, new_n, min_threshold, computed_threshold, status (open → locked → in_progress → verifying → complete | failed | expired | cancelled), webhook_url, timestamps
**recovery_participants**: participant_id, session_id, device_id, participant_type ('old_signer' | 'new_signer'), role, signer_index, device_public_key, connection_status, reported_address, biometric_verified, timestamps
**audit_events**: Comprehensive logging of all operations

## Key Types and Interfaces

**Signer Roles**: `'cfo' | 'controller' | 'backup'` - each ceremony requires exactly one of each

**Session Statuses**:
- Keygen: `waiting_for_participants → in_progress → complete | failed | cancelled`
- Signing: `waiting_for_signers → ready → in_progress → complete | failed`
- Recovery: `open → locked → in_progress → verifying → complete | failed | expired | cancelled`

**Critical Types** (coordinator/src/types/index.ts):
- `KeygenSession`, `KeygenParticipant`, `SigningSession`, `RecoverySession`, `RecoveryParticipant`
- `WSMessage` types for all WebSocket communication (including recovery messages)
- `JWTPayload` for WebSocket authentication
- `CurveType`: `'secp256k1' | 'ed25519'` — used by CryptoFactory to dispatch to correct implementation

## Security Notes

- JWT tokens used for WebSocket authentication (15 min expiry)
- Session expiry: 10 min for keygen, 30 min for signing
- All key shares encrypted in device Secure Enclave (iOS) / Keystore (Android)
- Biometric authentication required before accessing key shares for signing
- Comprehensive audit logging for all operations
- Role uniqueness enforced: each role can only join a ceremony once
- **Recovery ECIES**: Sub-shares are encrypted device-to-device using ECIES (ECDH + SHA-256 + XOR one-time pad + HMAC-SHA256). Coordinator never sees plaintext sub-shares. Separate implementations for secp256k1 (compressed points) and Ed25519 (Montgomery-form ECDH).
- **Feldman VSS**: New signers verify received sub-shares against published polynomial commitments before interpolating their new share.
- **Threshold hard floor**: Recovery enforces m >= 2 regardless of formula. Dynamic threshold: `m = max(min_threshold, ceil(2*n/3))`.
- **Address consensus on recovery**: All new signers must derive the same wallet address, and it must match the vault's known address — verifying the resharing preserved the same underlying key.

## Testing

The project uses Jest for testing. When writing tests:
- Coordinator: Test WebSocket message routing, session state transitions, database operations
- Mobile: Test service integrations, navigation flows, secure storage operations

## Common Development Patterns

### Adding a New WebSocket Message Type

1. Add type to `coordinator/src/types/index.ts` under `WSMessageType`
2. Add handler in `coordinator/src/services/WebSocketManager.ts` → `handleMessage()`
3. Add emitter in `mobile-signer/src/services/CoordinatorWS.ts` → `handleMessage()`
4. Listen for event in relevant client (e.g., `coordinatorWS.on('new_message_type', handler)`)

### Adding a New API Endpoint

1. Add request/response types to `coordinator/src/types/index.ts`
2. Create route handler in `coordinator/src/routes/` or `server.ts`
3. Add database methods to `DatabaseService` if needed
4. Add client method to `mobile-signer/src/services/CoordinatorAPI.ts`

### Adding a New Screen

**For screens in tabs** (main app UI):
1. Create screen component in `mobile-signer/src/screens/`
2. Add screen params to `MainTabParamList` in `src/navigation/types.ts`
3. Register in `TabNavigator.tsx` with icon and options
4. Use `useAuthStore()` for user session, `useVaultStore()` for vault data
5. Use `useFocusEffect()` to reload data when tab is focused

**For ceremony/signing flows** (full-screen, outside tabs):
1. Create screen component in `mobile-signer/src/screens/`
2. Add screen params to `RootStackParamList` in `src/navigation/types.ts`
3. Register in `AppNavigator.tsx` (in root stack, not tabs)
4. Set `gestureEnabled: false` for progress/completion screens
5. Use `useCeremonyStore()` for accessing ceremony state
6. Use `coordinatorWS.on()` for WebSocket event handling
7. Navigate back to `MainTabs` (with optional screen param) when done

## Environment Variables

**Coordinator** (.env):
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Secret for signing WebSocket JWT tokens
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: development | production

**SecondSet Web App** (.env) - Coordinator Integration:
- `COORDINATOR_URL`: Coordinator service URL (dev: `http://localhost:3000`, prod: `https://coordinator.secondset.com`)
- `COORDINATOR_API_KEY`: API key for coordinator authentication (rotate quarterly)
- `COORDINATOR_WEBHOOK_SECRET`: HMAC secret for verifying coordinator webhooks

**Mobile App**: No .env needed - coordinator URL configured in code

## Integration with SecondSet Web App

The coordinator service integrates with the main SecondSet web application for wallet setup and transaction signing flows.

### Wallet Setup Flow (Keygen)

1. **Web App**: User navigates to wallet setup page and clicks "Create Wallet"
2. **Web App**: Calls coordinator `POST /api/v1/keygen/sessions` with org_id, admin_user_id, role_assignments
3. **Coordinator**: Returns session_id, QR code data, short_code
4. **Web App**: Displays QR code for mobile devices to scan
5. **Mobile Devices**: 3 devices scan QR code and join ceremony (each with different role: cfo, controller, backup)
6. **Coordinator**: When all 3 connected → orchestrates DKG ceremony via WebSocket
7. **Coordinator**: On completion → sends webhook to web app with wallet_address, public_key
8. **Web App**: Saves wallet address to database and marks wallet as active

### Transaction Signing Flow

1. **Web App**: User creates payment request, gets approvals, builds unsigned tx
2. **Web App**: Signer releases → calls coordinator `POST /api/v1/signing/sessions` with `wallet_address`, `tx_digest` (keccak256 of serialized EIP-1559 tx), `tx_details` (includes display info for mobile), `required_signers: 2`
3. **Coordinator**: Creates signing session with status `waiting_for_signers`
4. **Mobile Devices**: Poll `GET /api/v1/signing/sessions/pending?wallet_address=0x...` to discover pending sessions, or scan QR code
5. **Mobile Devices**: Join session via `POST /api/v1/signing/sessions/:id/join`, authenticate with biometrics
6. **Mobile Devices**: Connect to WebSocket, participate in threshold signing ceremony (2-of-3)
7. **Mobile Devices**: Each creates partial signature using stored key share, signs the `tx_digest`
8. **Coordinator**: Aggregates 2 partial signatures → sends webhook with `{r, s}` signature to web app
9. **Web App**: `signing-status` endpoint assembles final tx (EIP-2 low-s normalization, yParity recovery), broadcasts to blockchain network

### Vault Recovery Flow

1. **Web App**: Admin initiates recovery for a vault → calls coordinator `POST /api/v1/recovery/sessions` with `wallet_address`, `old_threshold`, `old_n`, `new_n`, `chain`, `curve_type`, `min_threshold`, `webhook_url`
2. **Coordinator**: Creates recovery session (status: `open`) → returns session_id, QR code data (includes `type: "recovery"`, `wallet_address`, `curve_type`)
3. **Web App**: Displays QR code in RecoveryModal for mobile devices to scan
4. **Mobile Devices**: Old signers (existing key share holders) and new signers scan QR code → join with `participant_type`
5. **Coordinator**: When enough participants joined → locks session → broadcasts `recovery_start` with participant public keys
6. **Mobile Devices**: Execute resharing protocol — old signers create encrypted sub-shares via ECIES, new signers verify and interpolate
7. **Coordinator**: Collects `recovery_complete` from all participants → verifies address consensus → sends webhook to web app
8. **Web App**: Creates new vault record (or updates existing) with new threshold configuration

### Webhook Authentication

All webhooks from coordinator to web app MUST be authenticated:

1. **Coordinator** sends `x-coordinator-signature` header with HMAC-SHA256 signature
2. **Web App** verifies signature using `COORDINATOR_WEBHOOK_SECRET`
3. **Web App** rejects webhooks with invalid/missing signatures

Example verification:
```typescript
const expectedSignature = crypto
  .createHmac('sha256', COORDINATOR_WEBHOOK_SECRET)
  .update(JSON.stringify(request.body))
  .digest('hex');

if (request.headers['x-coordinator-signature'] !== expectedSignature) {
  throw new Error('Invalid webhook signature');
}
```

## Testing End-to-End Flows

### Test Keygen Ceremony

1. Start coordinator: `cd coordinator && npm run dev`
2. Start web app (separate repo)
3. Navigate to wallet setup page in web app
4. Click "Create Wallet" → QR code displayed
5. Open mobile app on 3 devices (or simulators)
6. Scan QR code with each device, selecting different roles (CFO, Controller, Backup)
7. Watch ceremony progress on all devices
8. Verify wallet address appears in web app database after completion
9. Verify all 3 mobile devices show same wallet address

### Test Transaction Signing

1. Ensure wallet exists from keygen test
2. Create payment request in web app
3. Get 2 approvals from designated users
4. Mobile devices (2 of 3) receive push notification
5. Open mobile app and authenticate with biometrics
6. Complete signing on 2 devices
7. Verify signature aggregation completes
8. Verify web app receives webhook with final signature
9. Verify transaction broadcasts to blockchain

### Test Vault Recovery

1. Ensure a wallet exists from a completed keygen ceremony (need at least 2 old signers available)
2. Admin initiates recovery from web app → QR code displayed
3. Old signers (2+ devices with existing key shares) scan QR → auto-detected as old signers
4. New signers (fresh devices) scan QR → select roles
5. Old signers authenticate with biometrics → sub-shares encrypted and sent
6. New signers receive, verify (Feldman VSS), and interpolate new shares
7. Verify all new signers derive same wallet address matching original vault
8. Verify new key shares stored in SecureStore on new devices
9. Verify coordinator webhook delivered to web app with recovery results
10. Test signing with new committee to confirm the recovered shares work

## Production Deployment

### Coordinator URL Configuration

- **Development**: `http://localhost:3000`
- **Production**: `https://coordinator.secondset.com`

Update coordinator URL in:
- Web app environment variables (`COORDINATOR_URL`)
- Mobile app configuration (hardcoded in `CoordinatorAPI.ts`)

### Security Checklist

- [ ] Rotate API keys quarterly (`COORDINATOR_API_KEY`)
- [ ] Use HTTPS for all coordinator communication in production
- [ ] Enable CORS only for web app domain (not `*`)
- [ ] Rate limit all API endpoints (prevent DoS)
- [ ] Rate limit webhook endpoints on web app
- [ ] Monitor failed webhook deliveries (alerts on 3+ consecutive failures)
- [ ] Log all coordinator API calls for audit trail
- [ ] Verify JWT_SECRET is cryptographically random (min 32 bytes)
- [ ] Enable PostgreSQL SSL in production
- [ ] Set up database backups (daily snapshots, 30-day retention)
- [ ] Configure monitoring for WebSocket connection drops
- [ ] Set up alerts for failed ceremonies (keygen/signing/recovery)
- [ ] Verify ECIES encryption in recovery uses correct curve-specific implementation (secp256k1 vs ed25519)
- [ ] Ensure recovery session expiry is enforced (prevents stale sessions from being joined)
