# SecondSet Web Application

The main user-facing interface for SecondSet treasury wallet management. Built with Next.js 16 (App Router) and React 19.

Handles the full payment request lifecycle — from draft to on-chain confirmation — and integrates with the Coordinator service for DKG wallet creation, threshold transaction signing, and vault recovery.

---

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth.js v4 (JWT-based, no server-side session storage)
- **EVM Blockchain**: viem (Ethereum, Base)
- **Solana Blockchain**: @solana/web3.js + @solana/spl-token
- **Coordinator Integration**: Custom `CoordinatorClient` (`src/lib/coordinator.ts`)

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Coordinator service running (see `secondset-mobile-signer/README.md`)

### Installation

```bash
npm install

# Set up environment variables (see Environment Variables section)
cp .env.example .env

# Run database migrations
npx prisma migrate dev

# Seed test data (creates org, users, and test vault)
npx prisma db seed

# Start development server
npm run dev
# Opens on http://localhost:3000
# If coordinator is also on 3000, change PORT or use: PORT=3001 npm run dev
```

### Other Commands

```bash
npm run build              # Production build
npm run lint               # ESLint check
npx prisma studio          # Visual database browser
npx tsc --noEmit           # TypeScript type check (no emit)
npx prisma generate        # Regenerate Prisma client after schema changes
npx prisma migrate deploy  # Apply migrations in production
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/secondset

# NextAuth
NEXTAUTH_SECRET=<generate: openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000

# JWT for release tokens (binds unsigned tx to signing session)
RELEASE_TOKEN_SECRET=<generate: openssl rand -base64 32>

# EVM RPC Endpoints
ETHEREUM_RPC_URL=https://...
SEPOLIA_RPC_URL=https://...        # Falls back to ETHEREUM_RPC_URL
BASE_RPC_URL=https://...
BASE_SEPOLIA_RPC_URL=https://...   # Falls back to BASE_RPC_URL

# Solana RPC Endpoints (optional, defaults to public endpoints)
SOLANA_DEVNET_RPC_URL=https://api.devnet.solana.com
SOLANA_MAINNET_RPC_URL=https://api.mainnet-beta.solana.com

# Coordinator Service
COORDINATOR_API_URL=http://localhost:3000
COORDINATOR_API_KEY=<must match coordinator COORDINATOR_API_KEY>
COORDINATOR_WEBHOOK_SECRET=<must match coordinator COORDINATOR_WEBHOOK_SECRET>

# Vault Recovery (enabled by default)
# VAULT_RECOVERY_ENABLED=false
```

---

## Application Structure

```
src/
├── app/
│   ├── api/                        # Next.js API routes (App Router)
│   │   ├── admin/
│   │   │   ├── audit/              # Audit log retrieval
│   │   │   ├── invites/            # User invite management
│   │   │   ├── payee-actions/      # Admin payee edit/delete requests
│   │   │   ├── users/              # User and role management
│   │   │   └── vaults/
│   │   │       ├── keygen/         # Wallet creation sessions
│   │   │       ├── recovery/       # Vault recovery sessions
│   │   │       └── [id]/           # Vault rename, check-incoming
│   │   ├── auth/                   # NextAuth, signup, invite accept, mobile login
│   │   ├── coordinator/webhook/    # Webhook receiver from coordinator
│   │   ├── payees/                 # Payee CRUD and approval
│   │   ├── requests/               # Payment request lifecycle
│   │   └── swaps/                  # Token swap requests
│   └── dashboard/
│       ├── admin/                  # Admin panels (users, vaults, audit, payees)
│       ├── approvals/              # Pending approvals view
│       ├── payees/                 # Payee list and creation
│       ├── releases/               # Transactions ready to sign
│       ├── requests/               # Payment request list and detail
│       └── swaps/                  # Swap request list and creation
├── lib/
│   ├── audit.ts                    # Hash-chained audit event logging
│   ├── auth.ts                     # NextAuth configuration
│   ├── coordinator.ts              # CoordinatorClient REST wrapper
│   ├── db.ts                       # Prisma client singleton
│   ├── rbac.ts                     # Role-based access control helpers
│   ├── webhooks.ts                 # Webhook HMAC verification
│   └── chains/
│       ├── utils.ts                # resolveVaultChain() — address-based chain detection
│       ├── evm/                    # EVM: builder, broadcaster, balances, signer, tokens, pricing
│       └── solana/                 # Solana: builder, balances, pricing
└── types/
    └── index.ts                    # Shared TypeScript types
```

---

## Payment Request State Machine

```
DRAFT → SUBMITTED → READY_TO_RELEASE → BROADCASTED → CONFIRMED
         (Submit)    (Approve + Build)   (Sign + Send)  (12 blocks)

Any stage → REJECTED
BROADCASTED → FAILED_BROADCAST  (retryable via /retry)
BROADCASTED → FAILED_CONFIRM    (tx reverted on-chain)
```

| Transition | Who | What Happens |
|---|---|---|
| Draft → Submitted | INITIATOR | Request submitted for approval |
| Submitted → Ready to Release | APPROVER | Unsigned transaction built, stored in DB |
| Ready to Release → Broadcasted | SIGNER | Signing session created, tx signed by 2-of-3 mobile signers, broadcast |
| Broadcasted → Confirmed | SIGNER | Polling detects 12 EVM confirmations or Solana finalized status |

---

## Role-Based Access Control

```typescript
// Require any authenticated user
const user = await requireAuth();

// Require specific roles (throws 403 if not matched)
const user = await requireRoles(['APPROVER', 'ADMIN']);
```

| Role | Key Permissions |
|---|---|
| INITIATOR | Create/edit/delete drafts, create payees, submit requests |
| APPROVER | Approve payees, approve submitted requests (triggers unsigned tx build) |
| SIGNER | Release approved requests (creates signing session), broadcast, confirm |
| ADMIN | All above + user/role management, vault creation, vault recovery |

**Conflict rules** (enforced in `src/lib/rbac.ts` and individual route handlers):
- Creator ≠ approver for payment requests
- Creator/approver ≠ signer for payment requests
- Payee creator ≠ payee approver

---

## Blockchain Integration

### Chain Detection

Always use `resolveVaultChain(vault.chain, vault.address)` from `src/lib/chains/utils.ts`. Address format is authoritative:
- `0x...` → EVM (Ethereum, Base)
- base58 → Solana

### EVM Transaction Flow (secp256k1 / ECDSA)

**Approve phase** (`src/lib/chains/evm/builder.ts`):
- Fetch nonce, encode ERC-20 calldata or ETH transfer calldata
- Estimate gas with 20% buffer; `maxPriorityFeePerGas` + 50% buffer, `maxFeePerGas` + 20% buffer
- Generate JWT release token (1-hour expiry, binds to `txDigest`)

**Release phase** (`src/app/api/requests/[id]/release/route.ts`):
- Verify JWT release token
- Compute `keccak256(serializeTransaction(unsignedTx))` as the signing digest
- Call `CoordinatorClient.createSigningSession()` with `chain: 'EVM'`

**Signing status / broadcast** (`src/app/api/requests/[id]/signing-status/route.ts`):
- Polled every 3 seconds by `SigningModal` on the frontend
- When coordinator webhook delivers `{r, s}`: apply EIP-2 low-s normalization, recover `yParity`, serialize and broadcast via viem `sendRawTransaction`
- Atomic DB lock prevents concurrent polls from double-broadcasting
- `nonce too low` on broadcast = tx was already sent, treated as success

**Confirmation** (`src/app/api/requests/[id]/check-confirmation/route.ts`):
- Requires 12 confirmations for EVM finality

### Solana Transaction Flow (Ed25519 / EdDSA)

**Approve phase** (`src/lib/chains/solana/builder.ts`):
- Build `SystemProgram.transfer` (SOL) or SPL `createTransferInstruction` (USDC)
- Fetch recent blockhash, serialize message → `txDigest` = hex of serialized message bytes

**Release phase**:
- Blockhash refreshed at release time (approval-time blockhash would be expired)
- Serialized message hex passed directly as `tx_digest` to coordinator (Ed25519 signs the message bytes)

**Signing status / broadcast**:
- Coordinator webhook delivers `{R, s}` (Ed25519)
- Concatenate `R (32B) || s (32B)` = 64-byte signature
- Reconstruct signed tx as `[1, sig64, messageBytes]` and broadcast via `connection.sendRawTransaction()`

**Confirmation**:
- Polls `connection.getSignatureStatuses()`, waits for `confirmationStatus === 'finalized'`

### Supported Assets

| Chain | Assets |
|---|---|
| EVM (Ethereum, Base) | ETH, USDC, USDT, EURC |
| Solana | SOL, USDC |

Solana USDC mints:
- Devnet: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- Mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

---

## Coordinator Integration

The `CoordinatorClient` (`src/lib/coordinator.ts`) wraps all REST calls to the coordinator service.

| Method | Description |
|---|---|
| `createKeygenSession()` | Initiate DKG wallet creation — returns QR code data |
| `cancelKeygenSession()` | Cancel an active keygen session |
| `getKeygenSessionStatus()` | Poll keygen progress |
| `createSigningSession()` | Initiate threshold signing — returns QR code data |
| `getSigningSessionStatus()` | Poll signing progress |
| `createRecoverySession()` | Initiate vault recovery resharing |
| `lockRecoverySession()` | Lock ceremony and start resharing |
| `cancelRecoverySession()` | Cancel an active recovery session |
| `getRecoverySessionStatus()` | Poll recovery progress |

### Webhook Handler (`src/app/api/coordinator/webhook/route.ts`)

Receives HMAC-signed callbacks from the coordinator:

| Event | Action |
|---|---|
| `keygen.completed` | Saves wallet address to Vault, marks KeygenSession COMPLETED |
| `keygen.failed` | Marks KeygenSession FAILED |
| `signing.completed` | Stores `{r, s}` on SigningSession — triggers broadcast on next poll |
| `signing.failed` | Marks SigningSession FAILED |
| `recovery.completed` | Marks RecoverySession COMPLETED, stores recovery record |
| `recovery.failed` | Marks RecoverySession FAILED |

Webhook signature verification: `HMAC-SHA256(timestamp + "." + body, COORDINATOR_WEBHOOK_SECRET)`.

---

## Admin Features

### Vault Creation (DKG)
- **`KeygenModal.tsx`**: Three-step modal — configure → display QR → wait for completion
- On modal close during an active session, automatically cancels via `POST /api/admin/vaults/keygen/[sessionId]/cancel`
- Coordinator cancel broadcasts `keygen_cancelled` to all connected mobile devices

### Vault Recovery
- **`RecoveryModal.tsx`**: Five-step modal — warning → QR + live participant list → lock → progress → complete/error
- Admin sees old and new signer counts live; clicks "Lock & Start Recovery" when ready
- Polls every 3 seconds via `GET /api/admin/vaults/recovery/[sessionId]`
- Cancellable at any step before completion

### User & Role Management
- Admins invite users via email link (`/invite/[token]`)
- Roles assigned and revoked per-user
- `UserRoleAssignment` tracks who assigned each role and when

### Payee Approval Workflow
1. INITIATOR creates payee → `PENDING`
2. APPROVER approves → `APPROVED` (payee can now receive payments)
3. ADMIN requests edit/delete via `PayeeAction`
4. APPROVER approves/rejects the action
5. DELETE: soft-delete (status set to REJECTED to preserve FK integrity)

### Audit Trail
Immutable, SHA256 hash-chained event log (`src/lib/audit.ts`):
- Each event hashes: orgId, userId, eventType, requestId, metadata, previousHash, timestamp
- Covers all state transitions, role changes, vault operations, and recovery events
- Non-blocking — audit failures are logged but don't break the main flow

---

## Database Schema (Key Models)

| Model | Purpose |
|---|---|
| `Organization` | Multi-tenant root — all entities scoped by `orgId` |
| `User` | Belongs to one org, can hold multiple roles |
| `UserRoleAssignment` | Junction table: userId, role, assignedBy, assignedAt |
| `Vault` | Blockchain wallet — stores address only, never private keys |
| `KeygenSession` | Tracks DKG ceremony: QR data, coordinator session ID, status |
| `SigningSession` | Tracks threshold signing: QR data, signed tx, status |
| `RecoverySession` | Tracks vault recovery: threshold policy, participant counts, recovery record |
| `Payee` | Approved payment recipient (requires APPROVER before use) |
| `PayeeAction` | Admin-initiated edit or delete request for a payee |
| `PaymentRequest` | Core workflow entity with full audit trail fields |
| `AuditEvent` | Hash-chained immutable log of all operations |

**Unique constraints**:
- User: `(orgId, email)`
- Vault: `(orgId, chain, address)`
- Payee: `(orgId, chain, address)`

---

## UI Components

| Component | Location | Purpose |
|---|---|---|
| `KeygenModal` | `dashboard/admin/vaults/` | Wallet creation: config → QR → completion |
| `SigningModal` | `dashboard/requests/[id]/` | Signing ceremony: shows QR, polls status every 3s |
| `RecoveryModal` | `dashboard/admin/vaults/` | Recovery: warning → QR + participants → lock → progress |
| `QRCodeDisplay` | `dashboard/admin/vaults/` | Reusable QR rendering (qrcode.react) |
| `ConfirmationPoller` | `dashboard/requests/[id]/` | Client-side poller for on-chain confirmation |
| `RequestActions` | `dashboard/requests/[id]/` | Approve / reject / release / retry action buttons |

---

## Test Accounts (after `prisma db seed`)

| Email | Role | Password |
|---|---|---|
| alice@acme.com | INITIATOR | password123 |
| bob@acme.com | APPROVER | password123 |
| charlie@acme.com | SIGNER | password123 |
| admin@acme.com | ADMIN | password123 |

---

## License

PROPRIETARY — SecondSet
