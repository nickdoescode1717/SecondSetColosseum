# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SecondSet is a multi-signature payment processing system for blockchain stablecoins (USDC, USDT, EURC) on EVM chains. It implements role-based access control with separation of duties, requiring multiple parties to approve and sign transactions before they're broadcast on-chain.

**Cryptographic Architecture**: Uses Distributed Key Generation (DKG) with a 2-of-3 threshold signature scheme. Private keys never exist on the server - they're generated and stored exclusively on mobile devices using hardware-backed secure storage (iOS Secure Enclave / Android Keystore). Transaction signing happens on mobile devices via a Mobile Signer App coordinated through a Coordinator service.

## Development Commands

```bash
# Install dependencies
npm install

# Development server (http://localhost:3000)
npm run dev

# Build for production
npm run build

# Lint code
npm run lint

# Database migrations
npx prisma migrate dev
npx prisma migrate deploy  # production

# Seed database with test data
npx prisma db seed

# Generate Prisma client (after schema changes)
npx prisma generate

# Prisma Studio (database GUI)
npx prisma studio

# TypeScript compiler check
npx tsc --noEmit
```

## Architecture Overview

### Tech Stack
- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth.js v4 (JWT-based)
- **Blockchain**: Viem (EVM chains)
- **Signing**: CoordinatorClient (DKG-based threshold signatures, 2-of-3 mobile signers)
- **Queue**: BullMQ + ioredis (infrastructure present, not yet implemented)
- **Storage**: AWS S3 SDK (infrastructure present, not yet implemented)

### Payment Request State Machine

Payment requests flow through a strict state machine enforced by the system:

```
DRAFT → SUBMITTED → READY_TO_RELEASE → BROADCASTED → CONFIRMED
         (Submit)    (Approve + Build)   (Sign + Send)  (12 Confirmations)
```

Alternative flows:
- **REJECTED**: Approver/signer rejects at SUBMITTED or READY_TO_RELEASE
- **FAILED_BROADCAST**: Transaction signing/broadcast fails (can retry)
- **FAILED_CONFIRM**: Transaction reverted on-chain

**Key Files**:
- Create/Edit Draft: `src/app/api/requests/route.ts`
- Submit: `src/app/api/requests/[id]/submit/route.ts`
- Approve: `src/app/api/requests/[id]/approve/route.ts` (builds unsigned tx — EVM + Solana)
- Release: `src/app/api/requests/[id]/release/route.ts` (creates signing session — EVM + Solana)
- Signing Status: `src/app/api/requests/[id]/signing-status/route.ts` (polls & broadcasts — EVM + Solana)
- Check Confirmation: `src/app/api/requests/[id]/check-confirmation/route.ts` (EVM + Solana)
- Retry: `src/app/api/requests/[id]/retry/route.ts`

### Role-Based Access Control (RBAC)

Four roles with separation of duties (`src/lib/rbac.ts`):

1. **INITIATOR**: Creates payees, creates/edits/deletes draft requests, submits requests
2. **APPROVER**: Approves payees, approves submitted requests (builds unsigned transaction)
3. **SIGNER**: Signs and broadcasts transactions, checks confirmations, retries failed broadcasts
4. **ADMIN**: All permissions + user/role management + vault creation

**Critical Rules**:
- Users cannot approve their own requests (creator ≠ approver)
- Signers cannot sign transactions they created or approved (creator ≠ signer, approver ≠ signer)
- Payee creators cannot approve their own payees
- Payee action requesters cannot approve their own payee actions

Conflicts are enforced in:
- `src/lib/rbac.ts`: `checkSelfApproval()`, `checkSignerConflict()`
- Individual route handlers perform additional validation

### Wallet Creation Flow (DKG Ceremony)

When an ADMIN creates a new vault:

1. **Initiate Keygen**: Admin triggers wallet creation via org settings UI
2. **Backend Call**: Web app calls `CoordinatorClient.createKeygenSession()`
   - Coordinator returns session ID and QR code data
3. **Display QR Code**: Web app displays QR code to admin
4. **Distribute to Signers**: Admin shares QR with 3 designated mobile signers:
   - CFO's mobile device
   - Controller's mobile device
   - Backup signer's mobile device
5. **Mobile Enrollment**: Each signer scans QR with Mobile Signer App
6. **DKG Ceremony**: Devices perform Distributed Key Generation via Coordinator
   - Private key shares generated independently on each device
   - Keys stored in hardware-backed secure storage (iOS Secure Enclave / Android Keystore)
   - No single device has the full private key
   - Web app never sees or stores private key material
7. **Address Verification**: Coordinator verifies all 3 devices agree on derived wallet address
8. **Webhook Callback**: Coordinator sends webhook to web app with `wallet_address`
9. **Store Wallet**: Web app stores `wallet_address` in Vault table
10. **Future Signing**: All future transactions require 2-of-3 mobile devices to sign (threshold signature)

**Critical Security Properties**:
- Private keys exist ONLY on mobile devices in secure enclaves
- Web app only stores wallet addresses (public data)
- Signing requires coordination of 2 out of 3 devices
- No single point of compromise

### Blockchain Transaction Flow

**Chain Detection**: Always use `resolveVaultChain(vault.chain, vault.address)` from `src/lib/chains/utils.ts`. Address format is authoritative: `0x` prefix = EVM, otherwise = SOLANA.

**Approval Phase**:
- **EVM** (`src/lib/chains/evm/builder.ts`): Fetch nonce, encode ERC-20 calldata (USDC/USDT/EURC) or ETH transfer, estimate gas with 20% buffer, get EIP-1559 gas prices, validate balance
- **Solana** (`src/lib/chains/solana/builder.ts`): Build `SystemProgram.transfer` (SOL) or SPL `createTransferInstruction` (USDC), fetch recent blockhash, serialize message → `txDigest` = hex of serialized message bytes (what Ed25519 signs)
- Both paths: generate JWT release token (1-hour expiry, binds to txDigest), store unsignedTx in DB

**Release Phase** (`src/app/api/requests/[id]/release/route.ts`):
- Verify JWT release token
- **EVM**: compute `keccak256(serializeTransaction(...))` as signing digest; SOL decimals = 18 (ETH) or 6 (stablecoin)
- **Solana**: use stored `txDigest` (serialized message hex) directly; SOL decimals = 9, USDC = 6
- Create signing session via `CoordinatorClient.createSigningSession()` with correct `chain`
- Store SigningSession, return QR code for mobile signers

**Broadcast** (`src/app/api/requests/[id]/signing-status/route.ts`):
- **EVM**: apply EIP-2 low-s normalization, recover yParity, serialize + broadcast via viem `sendRawTransaction`; nonce-too-low handled gracefully
- **Solana**: concatenate R (32B) + s (32B) = 64-byte Ed25519 sig, reconstruct signed tx as `[1, sig64, messageBytes]`, broadcast via `connection.sendRawTransaction()`

**Confirmation Polling** (`src/app/api/requests/[id]/check-confirmation/route.ts`):
- **EVM**: requires 12 confirmations
- **Solana**: uses `connection.getSignatureStatuses()`, checks for `confirmationStatus === 'finalized'`

**Asset Validation** (`src/app/api/requests/route.ts`, `[id]/route.ts`):
- Determined after vault lookup using `resolveVaultChain()`
- EVM: `['ETH', 'USDC', 'USDT', 'EURC']`
- Solana: `['SOL', 'USDC']`

**Supported Chains**:
- EVM: Ethereum Mainnet, Sepolia, Base, Base Sepolia
- Solana: Devnet (`solana-devnet`), Mainnet (`solana-mainnet`)

Each chain requires corresponding RPC URL in environment variables.

### Multi-Tenancy

All entities scoped to `Organization.id` (`orgId`):
- Every API route filters by `session.user.orgId`
- Prevents cross-organization data access
- Foreign key cascades on organization deletion

### Audit Trail

Immutable, hash-chained audit log (`src/lib/audit.ts`):
- Each AuditEvent contains hash of: orgId, userId, eventType, requestId, metadata, previousHash, timestamp
- SHA256 linking provides chain-of-custody verification
- Audit failures are non-blocking (logged but don't break main flow)
- Tracks all state transitions, role changes, payee actions

**Event Types**: See Prisma schema `AuditEventType` enum for full list. Includes keygen lifecycle events (KEYGEN_INITIATED, KEYGEN_COMPLETED, KEYGEN_FAILED, KEYGEN_CANCELLED), signing events (SIGNING_INITIATED, SIGNING_COMPLETED, SIGNING_FAILED), and recovery events (RECOVERY_INITIATED, RECOVERY_LOCKED, RECOVERY_CANCELLED, RECOVERY_COMPLETED, RECOVERY_FAILED).

### Payee Approval Workflow

**Initial Creation**:
1. INITIATOR creates payee → status: PENDING
2. APPROVER approves payee → status: APPROVED
3. Creator cannot approve own payee

**Edit/Delete Actions** (Admin-initiated):
1. ADMIN requests PayeeAction (type: EDIT or DELETE, proposedChanges in JSON)
2. APPROVER approves/rejects the action
3. DELETE: Soft-delete by setting payee status to REJECTED (prevents FK violations)
4. EDIT: Apply proposedChanges to payee record

Files:
- `src/app/api/payees/route.ts`
- `src/app/api/admin/payee-actions/route.ts`

## Database Schema Notes

### Key Models
- **Organization**: Multi-tenant root entity
- **User**: Users belong to one org, can have multiple roles
- **UserRoleAssignment**: Junction table tracking role assignments (includes assignedBy, assignedAt)
- **Vault**: Blockchain wallets (DKG-backed with 2-of-3 threshold signatures), one per chain per org
  - Stores wallet address only (NOT private keys)
  - `turnkeyWalletId` stores Coordinator session ID from keygen ceremony
- **KeygenSession**: Tracks DKG wallet creation sessions
  - Stores QR code data, coordinator session ID, status (PENDING/COMPLETED/FAILED/EXPIRED/CANCELLED)
  - Links to created Vault on completion
  - Admin can cancel active sessions via `POST /api/admin/vaults/keygen/[sessionId]/cancel`
- **SigningSession**: Tracks threshold signature sessions
  - Stores QR code data, signed transaction, status
  - Links to PaymentRequest being signed
- **Payee**: Payment recipients (require approval before use)
- **PayeeAction**: Tracks edit/delete requests for payees
- **PaymentRequest**: Main workflow entity with full audit trail
- **RecoverySession**: Tracks vault recovery resharing ceremonies
  - Stores coordinator session ID, QR code data, threshold policy, recovery record
  - Status: PENDING → OPEN → LOCKED → IN_PROGRESS → VERIFYING → COMPLETED | FAILED | EXPIRED | CANCELLED
  - Links to Vault, Organization, User (initiator)
  - `computedM`, `computedOldN`, `computedNewN` set at lock time
  - `recoveryRecord` stores JSON audit trail on completion
- **AuditEvent**: Immutable event log with hash chaining
  - Includes keygen, signing, and recovery event types
- **BroadcastJob**: Reserved for future async job queue

### Unique Constraints
- User: (orgId, email)
- Vault: (orgId, chain, address)
- Payee: (orgId, chain, address)
- UserRoleAssignment: (userId, role)

### Important Relationships
- PaymentRequest references: Organization, Vault, Payee, User (creator, submitter, approver, releaser)
- All entities cascade delete when Organization is deleted

## Authentication & Authorization

### NextAuth.js Configuration
- File: `src/lib/auth.ts`
- Strategy: JWT (no database session storage)
- Session includes: user.id, user.orgId, user.roles[]
- Credentials provider with bcrypt password verification

### Session Access
```typescript
import { requireAuth, requireRoles } from '@/lib/rbac';

// Any authenticated user
const user = await requireAuth();

// Specific role required
const user = await requireRoles(['APPROVER', 'ADMIN']);
```

### Test Credentials (after seeding)
- alice@acme.com (INITIATOR)
- bob@acme.com (APPROVER)
- charlie@acme.com (SIGNER)
- admin@acme.com (ADMIN)
- Password: password123

## Environment Variables

Required for development:
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/secondset

# NextAuth
NEXTAUTH_SECRET=<generate-random-secret>
NEXTAUTH_URL=http://localhost:3000

# JWT signing for release tokens
RELEASE_TOKEN_SECRET=<generate-random-secret>

# Blockchain RPC endpoints (EVM)
ETHEREUM_RPC_URL=https://...
SEPOLIA_RPC_URL=https://...  # Falls back to ETHEREUM_RPC_URL
BASE_RPC_URL=https://...
BASE_SEPOLIA_RPC_URL=https://...  # Falls back to BASE_RPC_URL

# Blockchain RPC endpoints (Solana)
SOLANA_DEVNET_RPC_URL=https://api.devnet.solana.com  # Optional, defaults to public
SOLANA_MAINNET_RPC_URL=https://api.mainnet-beta.solana.com  # Optional, defaults to public

# Development only (use CoordinatorClient in production)
TEST_SIGNER_PRIVATE_KEY=0x...

# Coordinator Service (DKG & Threshold Signatures)
COORDINATOR_API_URL=https://coordinator.example.com
COORDINATOR_API_KEY=<coordinator-api-key>
COORDINATOR_WEBHOOK_SECRET=<webhook-verification-secret>

# Vault Recovery (enabled by default, set to 'false' to disable)
# VAULT_RECOVERY_ENABLED=true

# Future: AWS S3 (not yet implemented)
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_REGION=
# AWS_S3_BUCKET=

# Future: Redis for BullMQ (not yet implemented)
# REDIS_URL=
```

## File Path Conventions

- **API Routes**: `src/app/api/**/*.ts` - Next.js API routes (App Router)
- **UI Pages**: `src/app/dashboard/**/*.tsx` - Server and client components
- **Shared Libraries**: `src/lib/*.ts` - Business logic, auth, audit, blockchain
- **Chain-Specific**: `src/lib/chains/{evm,solana}/*.ts` - Blockchain integrations
- **Types**: `src/types/index.ts` - Shared TypeScript types
- **Database**: `prisma/schema.prisma` - Prisma schema definition

## Testing Notes

- No test framework currently configured
- Manual testing via Prisma seed data
- Frontend component testing: Consider adding Vitest + React Testing Library
- API route testing: Consider adding Vitest with Next.js request mocking
- E2E testing: Consider adding Playwright

## Common Patterns

### API Route Structure
```typescript
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const user = await requireRoles(['INITIATOR', 'ADMIN']);
    const body = await req.json();

    // Validate input (consider adding Zod schemas)

    // Filter by orgId for multi-tenancy
    const result = await prisma.model.create({
      data: { ...body, orgId: user.orgId }
    });

    // Create audit event
    await createAuditEvent({ orgId: user.orgId, userId: user.id, ... });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
```

### Database Queries
Always filter by `orgId` from session:
```typescript
const user = await requireAuth();

const requests = await prisma.paymentRequest.findMany({
  where: { orgId: user.orgId, status: 'SUBMITTED' },
  include: { vault: true, payee: true, creator: true }
});
```

### Blockchain Interactions

**Building Unsigned Transactions**:
```typescript
import { buildEVMUSDCTransfer } from '@/lib/chains/evm/builder';

// Build unsigned transaction
const unsignedTx = await buildEVMUSDCTransfer({
  chainName: 'sepolia',
  fromAddress: vault.address,
  toAddress: payee.address,
  amountMinor: '1000000', // 1 USDC (6 decimals)
});

// Store in database, generate release token, etc.
```

**Signing and Broadcasting (Production Flow)**:
```typescript
import { CoordinatorClient } from '@/lib/coordinator';

// 1. Create signing session (in release endpoint)
// Release endpoint computes the Ethereum signing hash (keccak256 of serialized EIP-1559 tx)
// and passes it as txDigest so mobile signers sign the correct hash
const coordinator = new CoordinatorClient();
const signingResponse = await coordinator.createSigningSession({
  orgId: user.orgId,
  walletAddress: vault.address,
  requestId: request.id,
  txDigest: ethSigningHash, // keccak256 of serialized unsigned tx
  unsignedTx: storedUnsignedTx,
  chain: 'EVM',
  threshold: 2,
  webhookUrl: `${process.env.NEXTAUTH_URL}/api/coordinator/webhook`,
  displayInfo: {
    amount: '100',
    token: 'USDC',
    chain: 'sepolia',
    recipientAddress: payee.address,
    recipientName: payee.name,
    requestedBy: creator.name,
  },
});

// 2. Store signing session in database (stale sessions auto-cleaned)
// 3. Client shows SigningModal which polls signing-status endpoint every 3s
// 4. Coordinator receives signature from mobile signers, sends webhook
// 5. signing-status endpoint assembles final tx (r, s, yParity recovery)
//    and broadcasts to blockchain with race condition protection
```

**Broadcast Architecture** (`signing-status` endpoint):
- Receives TSS signature as `{r, s}` from coordinator webhook
- Applies EIP-2 low-s normalization (s must be in lower half of curve order)
- Recovers correct `yParity` by testing both 0 and 1 against vault address
- Serializes signed EIP-1559 transaction and broadcasts via `sendRawTransaction`
- **Race condition protection**: Atomic DB lock prevents concurrent polls from double-broadcasting
- **Nonce-too-low handling**: If broadcast fails with "nonce too low", the tx was already sent successfully

**Gas Fee Strategy** (`builder.ts`):
- `maxPriorityFeePerGas`: Estimated + 50% buffer (faster validator inclusion)
- `maxFeePerGas`: Estimated + 20% buffer (stays competitive across blocks)
- `gasLimit`: Estimated + 20% buffer

**Confirmation Checking** (`broadcaster.ts`):
- Handles viem's `TransactionReceiptNotFoundError` (thrown when tx not yet mined)
- Returns `pending` status instead of erroring, allowing client to keep polling
- Requires 12 confirmations for finality

**Coordinator API Endpoints**:
- **POST `/api/admin/vaults/keygen`**: Initiate DKG wallet creation
- **GET `/api/admin/vaults/keygen/[sessionId]`**: Poll keygen status
- **POST `/api/admin/vaults/keygen/[sessionId]/cancel`**: Cancel active keygen session (updates DB + notifies coordinator)
- **PATCH `/api/admin/vaults/[id]`**: Rename a vault (ADMIN only, `{ name: string }`, max 100 chars)
- **POST `/api/admin/vaults/recovery`**: Initiate vault recovery (ADMIN only, requires `vaultId` + `reason`)
- **GET `/api/admin/vaults/recovery/[sessionId]`**: Poll recovery status (syncs terminal states from coordinator)
- **POST `/api/admin/vaults/recovery/[sessionId]/lock`**: Lock recovery ceremony (requires 2+ old signers, 1+ new signers connected)
- **POST `/api/admin/vaults/recovery/[sessionId]/cancel`**: Cancel active recovery session
- **POST `/api/coordinator/webhook`**: Receive keygen/signing/recovery completion callbacks
- **GET `/api/requests/[id]/signing-status`**: Poll signing status and broadcast

**Coordinator Client** (`src/lib/coordinator.ts`):
- `createKeygenSession()` - Initiate DKG ceremony
- `cancelKeygenSession()` - Cancel an active keygen session on the coordinator
- `createSigningSession()` - Initiate threshold signing session
- `getKeygenSessionStatus()` - Poll keygen session status
- `getSigningSessionStatus()` - Poll signing session status
- `createRecoverySession()` - Initiate vault recovery resharing session
- `lockRecoverySession()` - Lock recovery ceremony (computes threshold, starts resharing)
- `cancelRecoverySession()` - Cancel an active recovery session on coordinator
- `getRecoverySessionStatus()` - Poll recovery session status

**UI Components**:
- **`KeygenModal.tsx`**: Three-step modal for wallet creation (config → QR → waiting). Automatically cancels the session on the coordinator if the modal is closed before completion.
- **`SigningModal.tsx`**: Modal shown during transaction signing. Polls `signing-status` every 3 seconds. On completion, shows success toast and refreshes page.
- **`RecoveryModal.tsx`**: Five-step modal for vault recovery (warning → QR + participants → progress → complete, plus error state). Shows old/new signer counts, auto-polls every 3 seconds, cancels session on close.
- **`QRCodeDisplay.tsx`**: Reusable QR code display component
- Keygen, signing, and recovery modals all use `qrcode.react` library for QR generation

## Known Limitations & TODOs

1. **Queue System**: BullMQ infrastructure present but not implemented
   - BroadcastJob table exists in schema
   - No worker processes or queue management yet

2. **AWS S3**: SDK imported but not integrated
   - PaymentRequest has `attachmentUrl` field
   - No upload endpoints or presigned URL generation

3. **Solana Support**: Fully implemented end-to-end
   - SOL transfers and USDC-SPL token transfers supported
   - `src/lib/chains/solana/builder.ts` — transaction building
   - `src/lib/chains/solana/balances.ts` — balance fetching
   - `src/lib/chains/solana/pricing.ts` — USD pricing via CoinGecko
   - `src/lib/chains/utils.ts` — `resolveVaultChain()` address-based chain detection
   - Approve, release, signing-status, check-confirmation all handle Solana
   - Devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

4. **Input Validation**: No Zod schemas for request validation
   - Consider adding schema validation for API routes

5. **Error Handling**: Basic try/catch, could be more granular
   - Consider adding error tracking (Sentry, etc.)

6. **Rate Limiting**: No rate limiting on API routes
   - Production deployment should add rate limiting

7. **WebSockets**: Confirmation and signing status polling is client-initiated
   - Could improve UX with WebSocket-based status updates for real-time feedback
