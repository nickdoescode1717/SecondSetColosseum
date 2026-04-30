# SecondSet — Treasury Wallet Management System

SecondSet is a full-stack treasury payment system for blockchain stablecoins, built around a **2-of-3 threshold signature scheme**. Private keys never touch a server — they are generated and stored exclusively on mobile devices using hardware-backed secure storage. Every transaction requires approval from multiple roles and signatures from at least 2 of 3 enrolled mobile signers.

Supports **EVM chains** (Ethereum, Base) via secp256k1 ECDSA and **Solana** via Ed25519 EdDSA.

---

## Repository Structure

This is a monorepo containing three independent but interconnected components:

```
SecondSetCombo-Wapp-Signer/
│
├── SecondSet/SecondSet/secondset/        # Web Application (Next.js)
│   ├── src/app/                          # Next.js App Router pages and API routes
│   ├── src/lib/                          # Business logic, auth, blockchain, coordinator client
│   ├── prisma/                           # PostgreSQL schema and migrations (Prisma ORM)
│   └── package.json
│
└── secondset-mobile-signer/              # Mobile Signer + Coordinator
    ├── coordinator/                      # Node.js coordinator service (Express + WebSocket)
    │   ├── src/                          # Routes, WebSocketManager, WebhookService, types
    │   └── migrations/                   # Raw PostgreSQL migration files
    └── mobile-signer/                    # React Native mobile app (Expo)
        ├── src/screens/                  # All UI screens
        ├── src/services/TSS/             # Threshold cryptography (DKG, signing, recovery)
        └── src/services/                 # SecureStorage, CoordinatorAPI, BiometricAuth
```

Each component has its own `package.json`, database, and environment variables. See the component-specific READMEs for detailed setup:

- **Web App**: `SecondSet/SecondSet/secondset/README.md`
- **Mobile Signer + Coordinator**: `secondset-mobile-signer/README.md`

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Web Application                          │
│                    (Next.js — Port 3001)                         │
│                                                                   │
│  Payment Request Workflow  ·  Role-Based Access Control          │
│  Unsigned Tx Builder       ·  Vault & User Management            │
│  Signing Status Poller     ·  Audit Trail (hash-chained)         │
│                                                                   │
│  PostgreSQL DB (Prisma)    ·  NextAuth.js JWT sessions           │
└──────────┬───────────────────────────────┬───────────────────────┘
           │ REST API calls                │ Webhook callbacks
           │ (COORDINATOR_API_KEY)         │ (HMAC-SHA256 verified)
           ▼                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Coordinator Service                         │
│                    (Node.js — Port 3000)                         │
│                                                                   │
│  REST API for session management (keygen / signing / recovery)   │
│  WebSocket server for real-time ceremony coordination            │
│  Signature aggregation (Lagrange / scalar sum)                   │
│  Webhook delivery with retry logic                               │
│                                                                   │
│  PostgreSQL DB (raw pg)    ·  JWT WebSocket auth (15 min)        │
│  NO KEY MATERIAL STORED    ·  Routes encrypted messages only     │
└──────────────────────────────────┬──────────────────────────────┘
                                   │ WebSocket (JWT)
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
             ┌───────────┐  ┌───────────┐  ┌───────────┐
             │  Mobile   │  │  Mobile   │  │  Mobile   │
             │ Signer 1  │  │ Signer 2  │  │ Signer 3  │
             │  (CFO)    │  │(Controller│  │  (Backup) │
             └───────────┘  └───────────┘  └───────────┘
              Secure Enclave  Secure Enclave  Secure Enclave
              key share 1/3   key share 2/3   key share 3/3
```

**Security principle**: The coordinator routes messages and never stores or sees private key material. During vault recovery, sub-shares are encrypted device-to-device via ECIES before passing through the coordinator.

---

## How the Components Interact

### Wallet Creation (DKG Ceremony)

1. Admin clicks "Create Wallet" in the web app → web app calls `POST /api/v1/keygen/sessions` on the coordinator
2. Coordinator returns QR code data; web app displays it
3. Three mobile signers scan the QR code and join via WebSocket
4. When all three are connected, coordinator broadcasts `keygen_start`
5. Mobile devices run Feldman VSS Distributed Key Generation:
   - Each generates a 1-of-3 key share, stored in Secure Enclave / Keystore
   - No full private key ever exists anywhere
6. Coordinator verifies all three devices agree on the derived wallet address
7. Coordinator sends `keygen.completed` webhook to web app
8. Web app stores the wallet address in its database

### Transaction Signing (2-of-3 Threshold)

1. **INITIATOR** creates a payment request → **APPROVER** approves it and the web app builds an unsigned transaction
2. **SIGNER** releases it → web app computes the signing digest and creates a signing session on the coordinator
3. Web app shows a QR code; two mobile signers scan and join
4. Each signer loads their key share (biometric auth required), creates a partial signature
5. Coordinator aggregates the two partial signatures and sends a `signing.completed` webhook
6. Web app assembles the final signed transaction and broadcasts it to the blockchain
7. Web app polls for on-chain confirmation (12 blocks for EVM, `finalized` status for Solana)

### Vault Recovery (Proactive Resharing)

When signers lose devices or key rotation is needed:

1. Admin initiates recovery → coordinator creates a recovery session (QR code)
2. Old signers (devices with existing key shares) and new signers scan the QR
3. Mobile app auto-detects old vs. new signer by checking local secure storage
4. Admin locks the session; coordinator computes threshold `m = max(2, ceil(2n/3))`
5. Old signers create encrypted sub-shares (ECIES, device-to-device) and Feldman commitments
6. New signers decrypt, verify via Feldman VSS, and Lagrange-interpolate their new key share
7. All new signers verify their derived wallet address matches the vault — confirming the resharing preserved the same group key
8. Coordinator delivers `recovery.completed` webhook to web app

---

## Technology Stack

| Component | Framework | Language | Database | Key Libraries |
|---|---|---|---|---|
| Web App | Next.js 16 + React 19 | TypeScript | PostgreSQL + Prisma | viem, NextAuth.js, @solana/web3.js, @solana/spl-token |
| Coordinator | Express + ws | TypeScript | PostgreSQL (raw pg) | jsonwebtoken, @noble/curves, uuid |
| Mobile App | React Native + Expo | TypeScript | None (SecureStore) | @noble/secp256k1, @noble/curves, zustand, expo-local-authentication |

---

## Supported Chains

| Chain | Network | Curve | Assets |
|---|---|---|---|
| Ethereum | Mainnet, Sepolia | secp256k1 | ETH, USDC, USDT, EURC |
| Base | Mainnet, Base Sepolia | secp256k1 | ETH, USDC, USDT, EURC |
| Solana | Mainnet, Devnet | Ed25519 | SOL, USDC |

Chain is resolved from address format at runtime: `0x` prefix = EVM, base58 = Solana. Never rely solely on the database `chain` field.

---

## Role-Based Access Control

Four roles with strict separation of duties:

| Role | Permissions |
|---|---|
| **INITIATOR** | Create/edit/delete draft requests, create payees, submit requests |
| **APPROVER** | Approve payees and submitted requests (triggers unsigned tx build) |
| **SIGNER** | Release approved requests (triggers signing session), broadcast, confirm |
| **ADMIN** | All of the above + user/role management, vault creation, vault recovery |

**Conflict rules enforced throughout**:
- A user cannot approve their own request
- A user cannot sign a transaction they created or approved
- A payee creator cannot approve their own payee

---

## Quick Start (Full System)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator (macOS) or Android Emulator

### 1. Coordinator Service
```bash
cd secondset-mobile-signer/coordinator
npm install
cp .env.example .env        # Fill in DATABASE_URL, JWT_SECRET, PORT, WEBAPP_WEBHOOK_URL, etc.
createdb secondset_coordinator
psql -U postgres -d secondset_coordinator -f migrations/001_initial_schema.sql
psql -U postgres -d secondset_coordinator -f migrations/002_signing_tables.sql
psql -U postgres -d secondset_coordinator -f migrations/003_add_chain_curve.sql
psql -U postgres -d secondset_coordinator -f migrations/004_widen_tx_digest.sql
psql -U postgres -d secondset_coordinator -f migrations/005_recovery_tables.sql
npm run dev                 # Starts on PORT (default 3000)
```

### 2. Web Application
```bash
cd SecondSet/SecondSet/secondset
npm install
# Create .env with DATABASE_URL, NEXTAUTH_SECRET, COORDINATOR_API_URL, etc.
npx prisma migrate dev
npx prisma db seed          # Creates test users and org
npm run dev                 # Starts on port 3001 (change to avoid coordinator conflict)
```

### 3. Mobile App
```bash
cd secondset-mobile-signer/mobile-signer
npm install
npm start                   # Expo dev server
# Press 'i' for iOS, 'a' for Android
```

### Test Accounts (after seeding)
| Email | Role | Password |
|---|---|---|
| alice@acme.com | INITIATOR | password123 |
| bob@acme.com | APPROVER | password123 |
| charlie@acme.com | SIGNER | password123 |
| admin@acme.com | ADMIN | password123 |

---

## Database Architecture

The system uses **two separate PostgreSQL databases** that do not share schemas:

**Web App DB** (`SecondSet/SecondSet/secondset` — Prisma):
- Organizations, users, roles, vaults, payment requests, payees, signing sessions, keygen sessions, recovery sessions, audit events

**Coordinator DB** (`secondset-mobile-signer/coordinator` — raw pg):
- Keygen sessions, signing sessions, recovery sessions, participants, audit events

They communicate only via REST API calls and HMAC-signed webhooks.

---

## Cross-Component Environment Variables

These variables must be consistent across both services:

| Variable | Web App `.env` | Coordinator `.env` |
|---|---|---|
| Coordinator URL | `COORDINATOR_API_URL=http://localhost:3000` | (self, set `PORT`) |
| API Key | `COORDINATOR_API_KEY=<key>` | `COORDINATOR_API_KEY=<same key>` |
| Webhook Secret | `COORDINATOR_WEBHOOK_SECRET=<secret>` | `COORDINATOR_WEBHOOK_SECRET=<same secret>` |

---

## Payment Request State Machine

```
DRAFT → SUBMITTED → READY_TO_RELEASE → BROADCASTED → CONFIRMED
         (Submit)    (Approve + Build)   (Sign + Send)  (12 blocks)

Any stage → REJECTED (approver/signer rejects)
BROADCASTED → FAILED_BROADCAST (signing/broadcast error — retryable)
BROADCASTED → FAILED_CONFIRM (tx reverted on-chain)
```

---

## Security Model

- **Private keys never leave devices** — generated and stored in iOS Secure Enclave / Android Keystore
- **Coordinator sees no key material** — routes encrypted ciphertext only
- **Recovery uses ECIES encryption** — sub-shares encrypted device-to-device (ECDH + XOR one-time pad + HMAC-SHA256)
- **Feldman VSS** — new signers verify received sub-shares cryptographically before interpolating
- **Address consensus** — all new signers must derive the same wallet address matching the vault
- **Biometric auth** required before any signing or recovery operation on mobile
- **HMAC-signed webhooks** — web app verifies all callbacks from the coordinator
- **Hash-chained audit log** — SHA256-linked event trail for chain-of-custody verification
- **Multi-tenant isolation** — all DB queries scoped to `orgId` from the authenticated session

---

## Common Pitfalls

1. **Port conflicts**: Web app and coordinator both default to port 3000. Change one before running both.
2. **Two separate databases**: Don't run Prisma migrations against the coordinator DB or vice versa.
3. **Coordinator URL on mobile**: Hardcoded in `mobile-signer/src/services/CoordinatorAPI.ts` — update for each environment.
4. **Solana stale blockhash**: Blockhash expires in ~60–90 seconds. The release endpoint refreshes it at sign time — never reuse the blockhash from approval time.
5. **Solana USDC mint**: Devnet = `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, Mainnet = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`. Wrong mint = zero balance.
6. **Chain detection**: Always use `resolveVaultChain(chain, address)` from `src/lib/chains/utils.ts`. Address format (`0x` = EVM, base58 = Solana) is authoritative over the DB `chain` field.
7. **Ed25519 signing**: Nonce scalars are NOT shared between signers (unlike secp256k1). Coordinator sums partial signatures — does not interpolate.
8. **Recovery threshold floor**: `m >= 2` always enforced, regardless of formula output.

---

## License

PROPRIETARY — SecondSet
