# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

This is a monorepo containing the complete SecondSet treasury wallet management system. The system implements a distributed key generation (DKG) and threshold signature scheme (2-of-3) for blockchain payment processing.

```
SecondSetCombo-Wapp&Signer/
├── SecondSet/SecondSet/secondset/    # Web Application (Next.js)
│   ├── CLAUDE.md                     # ⚠️ READ THIS for web app work
│   ├── src/                          # Next.js app, API routes, libraries
│   ├── prisma/                       # Database schema and migrations
│   └── package.json
│
└── secondset-mobile-signer/          # Mobile Signer & Coordinator
    ├── CLAUDE.md                     # ⚠️ READ THIS for mobile/coordinator work
    ├── coordinator/                  # Node.js coordinator service
    │   ├── src/                      # Express + WebSocket server
    │   ├── migrations/               # PostgreSQL migrations
    │   └── package.json
    └── mobile-signer/                # React Native mobile app
        ├── src/                      # Expo app, screens, services
        └── package.json
```

## System Architecture

The system consists of three interconnected components:

### 1. Web Application (Next.js)
**Location**: `SecondSet/SecondSet/secondset/`
**Purpose**: Main user interface for payment request management, approval workflows, and organization administration

**Key Features**:
- Multi-signature payment request workflow (DRAFT → SUBMITTED → READY_TO_RELEASE → BROADCASTED → CONFIRMED)
- Role-based access control (INITIATOR, APPROVER, SIGNER, ADMIN)
- Integration with Coordinator service for wallet creation and transaction signing
- PostgreSQL database with Prisma ORM
- NextAuth.js authentication

**When to work here**: Creating/editing payment requests, managing users/roles, approving transactions, building unsigned transactions, broadcasting signed transactions to blockchain

### 2. Coordinator Service (Node.js)
**Location**: `secondset-mobile-signer/coordinator/`
**Purpose**: Stateless WebSocket coordinator for DKG ceremonies, threshold signature aggregation, and vault recovery resharing

**Key Features**:
- REST API for session creation (keygen, signing, and recovery)
- WebSocket server for real-time multi-party ceremony coordination
- PostgreSQL database for session persistence and audit logging
- JWT authentication for WebSocket connections
- NO KEY MATERIAL stored (completely stateless regarding private keys)
- Vault recovery orchestration via proactive resharing protocol

**When to work here**: Implementing ceremony coordination logic, WebSocket message routing, session management, webhook delivery to web app, recovery ceremony orchestration

### 3. Mobile Signer App (React Native/Expo)
**Location**: `secondset-mobile-signer/mobile-signer/`
**Purpose**: Mobile application for generating and storing key shares in hardware-backed secure storage

**Key Features**:
- QR code scanning for ceremony enrollment (keygen and recovery)
- DKG key share generation (using @noble/secp256k1 and @noble/curves/ed25519)
- Threshold signature creation (2-of-3)
- Vault recovery via proactive resharing (ECIES-encrypted sub-share exchange)
- Secure storage in iOS Secure Enclave / Android Keystore
- Biometric authentication before signing and recovery
- Private keys NEVER leave the device

**When to work here**: Implementing TSS cryptography, secure storage, biometric authentication, ceremony participation UI, recovery resharing protocol

## How the Components Interact

### Wallet Creation Flow (DKG Ceremony)

1. **Web App**: Admin initiates wallet creation → calls Coordinator API
2. **Coordinator**: Creates keygen session → returns QR code data
3. **Web App**: Displays QR code to admin
4. **Mobile Devices**: 3 signers scan QR code → join coordinator session via WebSocket
5. **Coordinator**: Orchestrates DKG ceremony between 3 mobile devices
6. **Mobile Devices**: Each generates 1-of-3 key shares, stores in secure enclave
7. **Coordinator**: Verifies address consensus → sends webhook to Web App
8. **Web App**: Saves wallet address to database

### Session Cancellation Flow

If an admin closes the wallet creation modal before the ceremony completes:

1. **Web App**: KeygenModal detects close during active session → calls `POST /api/admin/vaults/keygen/{sessionId}/cancel`
2. **Web App**: Cancel API route updates KeygenSession status to `CANCELLED` in DB
3. **Web App**: Cancel API route calls `CoordinatorClient.cancelKeygenSession()` (best-effort)
4. **Coordinator**: Cancel endpoint updates session status to `cancelled`, broadcasts `keygen_cancelled` WS message to connected mobile devices, closes their WebSocket connections
5. **Mobile Devices**: Receive `keygen_cancelled` message → show alert → navigate back to main tabs
6. **Web App**: Admin can immediately retry wallet creation (CANCELLED sessions don't block new ones)

### Transaction Signing Flow

**EVM (secp256k1 / ECDSA)**:
1. **Web App**: User creates payment request → gets approvals → approve endpoint builds unsigned EVM tx
2. **Web App**: Signer releases → release endpoint computes Ethereum signing hash (`keccak256` of serialized EIP-1559 tx) → calls Coordinator with `tx_digest`
3. **Coordinator**: Creates signing session → returns QR code data
4. **Web App**: Shows `SigningModal`, polls `signing-status` every 3 seconds
5. **Mobile Devices**: Join session → biometric auth → partial ECDSA signature over `tx_digest`
6. **Coordinator**: Aggregates 2 partial sigs → webhook with `{r, s}`
7. **Web App**: `signing-status` applies EIP-2 low-s normalization, recovers yParity → broadcasts EIP-1559 tx
8. **Web App**: Polls `check-confirmation` for 12 confirmations → CONFIRMED

**Solana (Ed25519 / EdDSA)**:
1. **Web App**: Approve endpoint builds Solana tx (SOL via `SystemProgram.transfer`, USDC via SPL `createTransferInstruction`) → stores serialized message hex as `txDigest`
2. **Web App**: Release endpoint passes serialized message hex directly as `tx_digest` to Coordinator
3. **Mobile Devices**: Each creates partial Ed25519 signature; coordinator SUMS partial signatures
4. **Coordinator**: Sends webhook with `{R, s}` (Ed25519 combined signature)
5. **Web App**: `signing-status` concatenates R+s (64 bytes) → reconstructs signed Solana tx → broadcasts via `connection.sendRawTransaction()`
6. **Web App**: Polls `check-confirmation` for `finalized` status → CONFIRMED

### Vault Recovery Flow (Resharing Ceremony)

When signers lose devices or need to rotate keys, recovery redistributes key shares to a new committee without exposing the group secret:

1. **Web App**: Admin initiates recovery via `RecoveryModal` → calls `POST /api/admin/vaults/recovery` → calls Coordinator API
2. **Coordinator**: Creates recovery session → returns QR code data (contains `type: "recovery"`)
3. **Web App**: Displays QR code. Old signers (with existing key shares) and new signers scan it.
4. **Mobile Devices**: EnrollScreen detects `type: "recovery"` in QR → navigates to `RecoveryJoinScreen`
5. **Mobile (RecoveryJoinScreen)**: Auto-detects old vs new signer via `SecureStorage.getVaultKeyShareByAddress()`. Old signers authenticate with biometrics. New signers select a role. Device generates ECIES keypair and joins via `CoordinatorAPI.joinRecoverySession()`.
6. **Web App**: Admin clicks "Lock & Start Recovery" when enough participants are connected (2+ old signers, 1+ new signers)
7. **Coordinator**: Locks session, computes threshold (m = max(2, ceil(2n/3))), broadcasts `recovery_start` to all connected devices
8. **Mobile (Old Signers)**: Load existing key share → `OldSignerReshare.generateRound1()` creates degree-(m-1) polynomial, Feldman commitments, ECIES-encrypted sub-shares → broadcasts via WebSocket
9. **Mobile (New Signers)**: Receive encrypted sub-shares → `NewSignerReshare.processSubShares()` decrypts, Feldman-verifies, Lagrange-interpolates → derives new key share → verifies address matches vault → stores via `SecureStorage.storeVaultKeyShare()`
10. **Coordinator**: Verifies address consensus (all new signers report same address matching vault) → sends `recovery.completed` webhook
11. **Web App**: Updates `RecoverySession` to COMPLETED, stores recovery record

**Key Security Properties**:
- Coordinator never sees plaintext key material (sub-shares encrypted via ECIES device-to-device)
- ECIES uses ECDH + SHA-256 key derivation + XOR encryption + HMAC-SHA256 authentication (one-time pad, safe without AES)
- Feldman VSS commitments allow new signers to verify sub-shares without trusting any single old signer
- Address consensus ensures the reconstructed group key is correct
- Threshold hard floor: m >= 2 always (schema supports m=1 for future but currently enforced >= 2)
- Cross-org recovery: old signers validated by wallet_address match in `keygen_participants`, not org_id

## Working with This Repository

### Which CLAUDE.md to Use?

**ALWAYS refer to the specific CLAUDE.md file for the component you're working on:**

- **Web App Work** → Read `SecondSet/SecondSet/secondset/CLAUDE.md`
  - Payment request workflows, approval logic, user management, API routes, Prisma schema, blockchain broadcasting

- **Mobile/Coordinator Work** → Read `secondset-mobile-signer/CLAUDE.md`
  - Ceremony coordination, WebSocket routing, TSS cryptography, mobile UI, secure storage

### Starting Development

**Full System Setup** (all components):

1. **Coordinator Service**:
   ```bash
   cd secondset-mobile-signer/coordinator
   npm install
   # Set up PostgreSQL and run migrations
   npm run dev  # Port 3000
   ```

2. **Web Application**:
   ```bash
   cd SecondSet/SecondSet/secondset
   npm install
   # Set up PostgreSQL and run Prisma migrations
   npm run dev  # Port 3000 (change if coordinator running)
   ```

3. **Mobile App**:
   ```bash
   cd secondset-mobile-signer/mobile-signer
   npm install
   npm start  # Expo dev server
   # Press 'i' for iOS or 'a' for Android
   ```

### Working Directory Context

The root of this repository (`SecondSetCombo-Wapp&Signer/`) contains no executable code. Always `cd` into the specific component directory before running commands:

- **Web app commands**: `cd SecondSet/SecondSet/secondset`
- **Coordinator commands**: `cd secondset-mobile-signer/coordinator`
- **Mobile app commands**: `cd secondset-mobile-signer/mobile-signer`

## Security Architecture

**Critical Security Principle**: Private keys exist ONLY on mobile devices in hardware-backed secure storage. Neither the Web App nor the Coordinator ever see or store private key material — including during vault recovery.

- **Web App**: Stores wallet addresses (public data), unsigned transactions, approval records, recovery session metadata
- **Coordinator**: Routes messages only; holds no session state related to keys. During recovery, routes ECIES-encrypted sub-shares without access to plaintext.
- **Mobile Devices**: Generate and store key shares; sign transactions locally; perform resharing protocol for recovery
- **Threshold**: 2 of 3 mobile devices required for any transaction (configurable m-of-n after recovery)
- **Recovery**: Uses proactive resharing protocol with ECIES encryption and Feldman VSS verification. Old key shares are invalidated after successful redistribution.

## Database Architecture

This system uses **two separate PostgreSQL databases**:

1. **Web App Database** (`SecondSet/SecondSet/secondset`):
   - Organizations, users, roles, vaults, payment requests, payees, recovery sessions, audit events
   - Managed by Prisma ORM
   - See web app CLAUDE.md for schema details

2. **Coordinator Database** (`secondset-mobile-signer/coordinator`):
   - Keygen sessions, signing sessions, recovery sessions, participants, audit events
   - Managed by raw PostgreSQL (no ORM)
   - Migration `005_recovery_tables.sql` adds `recovery_sessions` and `recovery_participants` tables
   - See mobile-signer CLAUDE.md for schema details

These databases do NOT share schemas - they are independent services that communicate via REST/WebSocket APIs and webhooks.

## Technology Stack Overview

| Component | Framework | Database | Key Libraries |
|-----------|-----------|----------|---------------|
| Web App | Next.js 16 + React 19 | PostgreSQL + Prisma | viem, NextAuth.js, BullMQ, @solana/web3.js, @solana/spl-token |
| Coordinator | Node.js + Express + ws | PostgreSQL + pg | jsonwebtoken, uuid, @noble/curves |
| Mobile App | React Native + Expo | N/A (local SecureStore) | @noble/secp256k1, @noble/curves, zustand, expo-device, bs58 |

## Common Cross-Component Tasks

### Adding a New Blockchain Chain

1. **Web App**: Add chain config to `src/lib/chains/evm/chains.ts`
2. **Web App**: Add RPC URL environment variable
3. **Web App**: Add chain to Prisma enum in `schema.prisma`
4. **Coordinator**: Add chain type to supported chains (if different protocol)
5. **Mobile App**: Update signing logic to support chain-specific signatures

### Changing Session Expiry Times

1. **Coordinator**: Update session expiry in `src/services/SessionManager.ts`
2. **Web App**: Update JWT expiry in `src/lib/auth.ts` (release tokens)
3. **Mobile App**: Update UI countdown timers in ceremony screens

### Adding a New Webhook Event

1. **Coordinator**: Add webhook delivery logic in `src/services/WebhookService.ts`
2. **Web App**: Add webhook handler in `src/app/api/coordinator/webhook/route.ts`
3. **Web App**: Update webhook signature verification

## Environment Variables

Each component requires its own `.env` file. See the respective CLAUDE.md files for complete environment variable documentation:

- **Web App**: See `SecondSet/SecondSet/secondset/CLAUDE.md`
- **Coordinator**: See `secondset-mobile-signer/CLAUDE.md`

**Cross-Component Variables** (must match across services):
- `COORDINATOR_URL` (Web App) ↔ Coordinator deployment URL
- `COORDINATOR_WEBHOOK_SECRET` (both) - for webhook HMAC verification
- `COORDINATOR_API_KEY` (both) - for API authentication

## Testing

Each component has independent test suites:

- **Web App**: Manual testing with Prisma seed data (no test framework configured)
- **Coordinator**: Jest test suite (`npm test`)
- **Mobile App**: Jest test suite (`npm test`)

**Integration Testing**: To test the full keygen flow end-to-end:
1. Start coordinator service
2. Start web app
3. Create wallet in web app (displays QR code)
4. Open mobile app on 3 devices/simulators
5. Scan QR code with each device
6. Verify wallet address appears in web app after ceremony completes

**Integration Testing — Vault Recovery**:
1. Prerequisite: Complete keygen test above (vault with 3 key shares on 3 devices)
2. In web app, admin opens RecoveryModal for the vault → enters reason → clicks "Start Recovery"
3. 2+ devices with existing key shares scan recovery QR → join as `old_signer` (biometric auth required)
4. 1+ new devices scan recovery QR → join as `new_signer` (select role)
5. Admin clicks "Lock & Start Recovery" in web app
6. Watch resharing progress on all devices (old signers send sub-shares, new signers compute key shares)
7. Verify all new signers show same wallet address matching the vault
8. Verify web app shows recovery complete with recovery record

## Common Pitfalls

1. **Port Conflicts**: Both Web App and Coordinator default to port 3000. Change one if running simultaneously.
2. **Database Confusion**: Web App and Coordinator use separate databases. Don't run migrations in the wrong database.
3. **Working Directory**: Always `cd` into the specific component directory before running npm commands.
4. **Environment Variables**: Each component needs its own `.env` file in its respective directory.
5. **Coordinator URL**: Mobile app has coordinator URL hardcoded in source. Web app uses environment variable.
6. **Chain Detection**: Use `resolveVaultChain(chain, address)` from `src/lib/chains/utils.ts` — never rely solely on the DB `chain` field. Address format (0x prefix = EVM, base58 = Solana) is authoritative.
7. **Solana USDC Mint**: Devnet = `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, Mainnet = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Wrong mint → zero balance.
8. **Solana Ed25519 signing**: nonce scalars are NOT shared between signers (unlike ECDSA). Coordinator SUMS partial sigs. Signature is R (32B) + s (32B) = 64 bytes total.
9. **Recovery ECIES**: Sub-shares are encrypted device-to-device using ECDH + XOR + HMAC (not AES). This works because sub-shares are exactly 32 bytes, making XOR a one-time pad. Uses separate ECIES implementations for secp256k1 and Ed25519 curves.
10. **Recovery threshold**: m = max(min_threshold, ceil(2*n/3)) where n = number of new signers. Hard floor m >= 2 enforced by coordinator lock endpoint. Schema supports `allow_m_one: true` for future 1-of-n but currently disabled.
11. **Recovery QR detection**: Mobile `EnrollScreen` detects recovery QR codes via `type: "recovery"` field (keygen QR codes have no `type` field). Recovery navigates to `RecoveryJoinScreen` instead of `JoinCeremonyScreen`.

## Getting Help

For detailed information on a specific component, **ALWAYS consult the component-specific CLAUDE.md file first**:

- Web App: `SecondSet/SecondSet/secondset/CLAUDE.md`
- Mobile/Coordinator: `secondset-mobile-signer/CLAUDE.md`

This root CLAUDE.md only provides high-level navigation and cross-component context.
