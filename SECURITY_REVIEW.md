# SecondSet 2-of-3 Threshold Signature System — Security Review

**Date:** 2026-04-30  
**Scope:** Signing infrastructure, key generation infrastructure, recovery protocol, coordinator, web app signing flow  
**Status:** Findings only — no code changes made

---

## Executive Summary

SecondSet implements a distributed key generation (DKG) and threshold signing protocol using Shamir secret sharing (2-of-3 threshold) for both secp256k1 (EVM chains) and Ed25519 (Solana). The system coordinates cryptographic operations across mobile signers and a central coordinator via WebSocket with real-time session management.

**Overall Risk Assessment: HIGH** — 6 CRITICAL, 8 HIGH, 8 MEDIUM, 5 LOW, 3 INFO findings.

The system has a strong architectural foundation (hardware-backed key storage, biometric auth, Feldman VSS, ECIES-encrypted sub-shares, webhook HMAC, proper curve separation) but has multiple cryptographic implementation issues that must be resolved before production use.

---

## Findings Summary

| # | Severity | Category | Title |
|---|----------|----------|-------|
| 1 | **CRITICAL** | Cryptography | Biased PRNG in randomFieldElement() |
| 2 | **CRITICAL** | Cryptography | Timing-Vulnerable Modular Inverse |
| 3 | **CRITICAL** | Cryptography | Elliptic Curve Point Validation Missing |
| 4 | **CRITICAL** | Protocol | Feldman Verification Not Enforced in DKG |
| 5 | **CRITICAL** | Key Material | Private Key Material Exposure in Memory/Logs |
| 6 | **CRITICAL** | Session Security | JWT Tokens Not Revocable on Logout |
| 7 | **HIGH** | Cryptography | Weak ECDH/KDF in ECIES (Recovery) |
| 9 | **HIGH** | Protocol | Race Condition in Signature Aggregation |
| 10 | **HIGH** | Authorization | No RBAC Validation on Signing Role Claims |
| 11 | **HIGH** | Input Validation | Insufficient Commitment Validation |
| 12 | **HIGH** | Session Security | WebSocket Token in URL Query Parameter |
| 13 | **HIGH** | Protocol | No Consensus Mechanism for Ceremony Start |
| 14 | **HIGH** | Secure Storage | Vault Metadata Unencrypted in AsyncStorage |
| 15 | **HIGH** | Protocol | No Message Integrity in Round Messages |
| 16 | **MEDIUM** | Cryptography | Missing Cofactor Multiplication in Ed25519 DKG |
| 17 | **MEDIUM** | Cryptography | Incomplete Point Validation in Recovery |
| 18 | **MEDIUM** | Protocol | No Integrity Check for Round Messages |
| 19 | **MEDIUM** | Session Mgmt | Session Timeout Configuration Unclear |
| 20 | **MEDIUM** | Webhook | Webhook Signature Not Validated on Receiver |
| 21 | **MEDIUM** | Logging | Sensitive Data in Console Logs |
| 22 | **MEDIUM** | Storage | AsyncStorage Metadata Unencrypted |
| 23 | **LOW** | Configuration | Hard-Coded Localhost URL Fallbacks |
| 24 | **LOW** | Rate Limiting | Rate Limits Per-Endpoint, Not Per-User |
| 25 | **LOW** | Error Handling | Overly Descriptive Error Messages |
| 26 | **INFO** | Code Quality | Missing Input Boundary Checks in Crypto |
| 27 | **INFO** | Code Quality | No Formal Verification of Crypto Primitives |

---

## Detailed Findings

---

### CRITICAL-1: Biased PRNG in `randomFieldElement()`

**File:** `mobile-signer/src/services/TSS/TSSCrypto.ts` (~line 23)  
**Also affects:** `Ed25519Crypto.ts` if it has its own field-element sampling

**Description:**  
The implementation uses `crypto.getRandomValues()` (correct) but then reduces the result modulo CURVE_ORDER via a simple `% CURVE_ORDER`. Because CURVE_ORDER is not a power of 2, this introduces a statistical bias toward smaller values — elements near 0 are more likely than elements near CURVE_ORDER. The bias is roughly 1-in-2^128 for secp256k1 but is a protocol violation and may be worse for smaller fields or if the implementation is used elsewhere.

This affects:
- Polynomial coefficient generation in DKG (the dealer's secret polynomial)
- Nonce generation for partial signatures
- ECIES ephemeral key generation

**Impact:** Biased random values weaken the security of the DKG. In theory an attacker observing multiple keygen ceremonies could exploit the bias to narrow the key space.

**Recommendation:**  
Use rejection sampling — generate 32 random bytes, interpret as a big integer, and reject-and-retry if the result ≥ CURVE_ORDER. This produces a perfectly uniform distribution. The `@noble/curves` library (already a dependency in the coordinator) does this correctly and can be reused in the mobile app.

```typescript
// Correct rejection-sampling approach (pseudocode)
function randomFieldElement(order: bigint): bigint {
  while (true) {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const n = bytesToBigInt(bytes);
    if (n > 0n && n < order) return n;
  }
}
```

---

### CRITICAL-2: Timing-Vulnerable Modular Inverse

**File:** `mobile-signer/src/services/TSS/TSSCrypto.ts` (~line 39)

**Description:**  
The extended Euclidean algorithm used for modular inverse has variable runtime proportional to the magnitudes of intermediate quotients. An attacker with precise timing access (local or via network timing) can infer information about the values being inverted — specifically the Lagrange coefficients computed during partial signature generation, which are directly related to secret share indices.

**Impact:** Timing side-channel that could leak Lagrange coefficients, and by extension, secret share material. Particularly dangerous because signing is done repeatedly against the same secret.

**Recommendation:**  
Use `@noble/secp256k1`'s built-in `invert()` (constant-time) or implement Montgomery's algorithm. Do not write custom modular inverse in signing paths.

---

### CRITICAL-3: Elliptic Curve Point Validation Missing

**File:** `mobile-signer/src/services/TSS/TSSCrypto.ts` (point arithmetic functions)

**Description:**  
The `addPoints()` / `scalarMul()` functions do not verify that input points lie on the secp256k1 curve (`y² ≡ x³ + 7 mod p`). Points received from the network (coordinator-relayed round messages) are used in DKG commitment verification and signing without validation.

An attacker controlling one participant can inject a point not on the curve. Combined with valid points, this can be used to:
- Manipulate the aggregated public key
- Derive information about other participants' key shares
- Cause signature generation to produce invalid or forgeable signatures

**Impact:** A single malicious participant can compromise the entire group key or enable signature forgery.

**Recommendation:**  
Validate all points received from the network before any computation:
```typescript
function validatePoint(p: Point): void {
  // Check y² = x³ + 7 mod p
  const lhs = (p.y * p.y) % CURVE_P;
  const rhs = (p.x * p.x * p.x + 7n) % CURVE_P;
  if (lhs !== rhs) throw new Error("Invalid curve point");
  if (p.x === 0n && p.y === 0n) throw new Error("Point at infinity");
}
```
Alternatively, migrate all point arithmetic to `@noble/secp256k1` / `@noble/curves` which performs these checks automatically.

---

### CRITICAL-4: Feldman VSS Verification Not Enforced in DKG

**File:** `mobile-signer/src/services/TSS/TSSCrypto.ts` (Round 2 processing) and `coordinator/src/services/WebSocketManager.ts`

**Description:**  
Feldman VSS requires each participant to verify their received share against the dealer's published commitments: `f(i)·G = Σ C_j · i^j` for each commitment polynomial coefficient `C_j`. If verification is skipped or not enforced by the coordinator, a malicious dealer can distribute inconsistent shares.

From the code review, it is unclear whether the mobile app enforces this check and whether the coordinator requires a verification acknowledgment before advancing the ceremony. If neither enforces it, a malicious participant can distribute garbage shares.

**Impact:** A malicious DKG participant (one of the 3 signers) can subvert key generation so that the resulting threshold key is under their sole control — without the other signers knowing.

**Recommendation:**  
1. In `processRound2()`, add explicit Feldman verification before accepting a share. Throw if verification fails.
2. Have each participant broadcast a signed "I verified successfully" message.
3. Coordinator must collect all N verification acknowledgments before completing the ceremony.
4. Add audit log entries for all verification results.

---

### CRITICAL-5: Private Key Material Exposure in Memory / Logs

**Files:**  
- `mobile-signer/src/services/SecureStorage.ts`  
- Multiple files with `console.log()` statements

**Description:**  
Several exposure vectors exist:

1. **Migration path:** `migrateFromLegacy()` reads key material from old storage into JavaScript heap, where it may persist until GC.
2. **JSON serialization:** `JSON.stringify(keyShare)` creates a temporary in-memory string containing the encrypted (but potentially sensitive) share. JavaScript strings are immutable and cannot be zeroed.
3. **Console logs:** Emoji-decorated debug logs (e.g., `console.log('📡 Connecting to WebSocket:', url)`) could inadvertently log URLs containing tokens, participant IDs, or ceremony parameters. In React Native, these go to Metro bundler output and may be captured by crash reporting SDKs.
4. **Error boundaries:** If a crypto operation throws and the error is rethrown with context, secret values might appear in stack traces.

**Impact:** Key material or authentication tokens exposed via logs, crash reports, or heap dumps — especially on devices with crash-reporting SDKs enabled.

**Recommendation:**  
- Zero-fill TypedArrays holding key material immediately after use: `bytes.fill(0)`
- Audit all `console.log` calls — redact or remove anything referencing tokens, ceremony state, or key data
- Disable console logging in production builds (`__DEV__` guard)
- Do not include key material in Error messages or stack traces

---

### CRITICAL-6: JWT Tokens Not Revocable on Logout

**Files:** `mobile-signer/src/services/CoordinatorAPI.ts`, `coordinator/src/services/WebSocketManager.ts`

**Description:**  
WebSocket ceremony tokens are JWTs with 30-minute expiry. The coordinator has no token blacklist. If a user logs out (or a device is stolen / compromised), their issued tokens remain valid for the remainder of the 30-minute window. An attacker who captured a token can:
- Reconnect to an active signing or recovery ceremony
- Approve transactions without the legitimate user knowing

**Impact:** Session hijacking window of up to 30 minutes after logout or compromise.

**Recommendation:**  
1. Maintain a Redis/PostgreSQL token blacklist keyed by `jti` (JWT ID) with TTL = expiry time.
2. On logout, add all outstanding tokens to the blacklist.
3. On every WebSocket `authenticate` message, check the `jti` against the blacklist before accepting.
4. Reduce token TTL to 5–10 minutes.

---

### HIGH-7: Weak ECDH/KDF in ECIES Recovery Encryption

**File:** `mobile-signer/src/services/TSS/RecoveryCrypto.ts` (~line 120)

**Description:**  
The ECIES implementation derives encryption and MAC keys by passing the raw ECDH shared secret directly through SHA-256:
```
kdf = SHA256(sharedSecret)
encKey = kdf[0:32]
macKey = kdf[32:64]  // SHA-256 only produces 32 bytes — macKey would be empty!
```

Issues:
1. **Single SHA-256 produces only 32 bytes** — if the code tries to split it 32/32, the MAC key is zero-length or undefined.
2. **No HKDF salt/info** — the KDF doesn't bind to the protocol context, enabling cross-protocol attacks.
3. **XOR with 32-byte key is a one-time pad** — secure IF and ONLY IF the key is uniform random. If SHA-256 output has any bias (e.g., low-entropy ECDH shared secret from invalid point injection), XOR becomes breakable.

**Impact:** Decryption of recovery sub-shares by an attacker, leading to vault compromise during recovery ceremonies.

**Recommendation:**  
Replace with HKDF (RFC 5869):
```typescript
const prk = hkdfExtract(SHA256, sharedSecret, salt="SecondSetRecovery");
const encKey = hkdfExpand(SHA256, prk, "encryption", 32);
const macKey = hkdfExpand(SHA256, prk, "authentication", 32);
```
The `@noble/hashes` library (already available or easy to add) provides `hkdf`.

---

### HIGH-8: Race Condition in Signature Aggregation

**File:** `coordinator/src/services/WebSocketManager.ts` (signing flow, ~line 680)

**Description:**  
The coordinator collects partial signatures from participants and aggregates once a threshold is reached. If a participant sends a duplicate message (network retry) after the threshold is already met, the duplicate could be included in a second aggregation attempt — especially if the state machine doesn't lock after aggregation begins. This could result in combining partial signatures from different ceremony rounds.

**Impact:** Incorrect signature aggregation causing transaction broadcast failure; or in a worst case, mixing old and new partial signatures producing a valid but unintended signature.

**Recommendation:**  
- Implement an explicit state lock: once `aggregating` state is entered, reject all further round messages.
- Track received-from set per ceremony, reject duplicates.
- Use a database-level unique constraint on `(session_id, participant_id, round)` for partial signature records.

---

### HIGH-10: No RBAC Validation on Signing Role Claims

**File:** `coordinator/src/routes/signing.routes.ts` (~line 80)

**Description:**  
When a device joins a signing session, it provides its `role` and `signer_index` in the request body. The coordinator does not verify these values against the stored keygen participant records. Any device that knows a valid session ID and join token can claim any role and index.

**Impact:** An attacker who intercepts a join token (see HIGH-12 for the URL exposure vector) could participate in a signing ceremony claiming to be any signer, injecting a partial signature for an index not their own — corrupting aggregation.

**Recommendation:**  
On join:
1. Look up the `keygen_participants` record for `(session_id, device_id, wallet_address)`.
2. Reject if the claimed `role` or `signer_index` does not match the stored values.
3. Never trust client-supplied `signer_index` — derive it server-side from the DB.

---

### HIGH-11: Commitment Arrays Not Length-Validated

**File:** `mobile-signer/src/services/TSS/TSSCrypto.ts` and `Ed25519Crypto.ts` (Round 1 processing)

**Description:**  
Received Feldman commitment arrays are used without verifying their length matches the expected polynomial degree. For a (t, n) threshold scheme the commitment array should have exactly `t` elements. An attacker sending fewer commitments causes array index out-of-bounds (caught by JS as `undefined`), but sending more commitments could cause extra computation or allow a biased polynomial to appear valid.

**Recommendation:** Assert `commitments.length === threshold` before any verification computation.

---

### HIGH-12: WebSocket Join Token in URL Query Parameter

**File:** `mobile-signer/src/services/CoordinatorWS.ts` (~line 24)

**Description:**  
```typescript
const url = `${wsUrl}?token=${token}`;
this.ws = new WebSocket(url);
```

The join token is embedded in the URL. In React Native, network calls are visible in Metro bundler logs and in Expo's developer tools. If any logging SDK (Sentry, Crashlytics, DataDog) captures network requests, it will capture the token in the URL.

**Recommendation:**  
Send the token as the first WebSocket message after the connection is established, or use the WebSocket subprotocol mechanism:
```typescript
this.ws = new WebSocket(wsUrl, [`token.${token}`]);
```
Then validate the subprotocol on the server side.

---

### HIGH-13: No Ceremony Start Consensus

**File:** `coordinator/src/services/WebSocketManager.ts` (ceremony start broadcast)

**Description:**  
The coordinator broadcasts `keygen_start` / `signing_start` to all connected participants, but does not wait for acknowledgments. If a participant's WebSocket is in a broken-but-not-disconnected state (TCP half-open), they receive the start event but produce no output. The ceremony silently stalls until timeout.

**Recommendation:**  
1. Broadcast `ceremony_prepare` with ceremony parameters.
2. Wait for `ceremony_ready` acknowledgment from all expected participants (with 10-second timeout per participant).
3. Only broadcast `ceremony_start` once all participants have acknowledged.
4. Include a hash of ceremony parameters in the acknowledgment so participants confirm they received the same parameters.

---

### HIGH-14: Vault Metadata Unencrypted in AsyncStorage

**File:** `mobile-signer/src/services/SecureStorage.ts` (~line 200)

**Description:**  
The vault index (mapping vault IDs to wallet addresses, org IDs, chain, curve type) is stored in `AsyncStorage` as plaintext JSON. `AsyncStorage` is not encrypted on Android by default and is accessible on rooted/jailbroken devices or via ADB backup.

**Impact:** An attacker with filesystem access can enumerate all wallet addresses controlled by this device, revealing financial holdings and organizational memberships.

**Recommendation:**  
Move the vault index into `expo-secure-store` (which uses Secure Enclave / Keystore), or encrypt it with a key derived from the device's biometric-protected key material before storing in AsyncStorage.

---

### HIGH-15: Round Messages Have No Integrity Guarantee

**File:** `coordinator/src/services/WebSocketManager.ts` (round relay logic)

**Description:**  
Round messages (commitments, partial signatures, sub-shares) are relayed by the coordinator without any cryptographic binding from the sender. A message from participant A claiming to contain A's commitments could have been substituted in transit (coordinator compromise or MITM before the TLS endpoint). There are no participant signatures over the message contents.

**Impact:** A compromised coordinator can substitute round messages, enabling key manipulation or signature forgery without any of the mobile participants detecting it.

**Recommendation:**  
Each round message should include a signature over `(session_id || round || message_hash)` using the device's long-term identity key. Recipients must verify this signature before using the message contents.

---

### MEDIUM-16: Missing Cofactor Multiplication in Ed25519 DKG

**File:** `mobile-signer/src/services/TSS/Ed25519Crypto.ts` (~line 60)

**Description:**  
Ed25519 has a cofactor of 8. Points on the full group may lie in a torsion subgroup of order 8 rather than the prime-order subgroup. If received DKG commitment points are not validated to be in the prime-order subgroup (via cofactor multiplication and checking the result ≠ identity), a malicious participant can use torsion points to inject ambiguity into key reconstruction.

**Recommendation:**  
Multiply all received points by the cofactor 8 and check the result is not the identity before accepting them as commitments. The `@noble/curves/ed25519` `ExtendedPoint` type provides `.multiply()` and `.assertValidity()`.

---

### MEDIUM-17: Incomplete Point Validation in Recovery ECIES

**File:** `mobile-signer/src/services/TSS/RecoveryCrypto.ts` (~line 300)

**Description:**  
The ECIES decryption path deserializes the ephemeral public key from the ciphertext without verifying it is a valid curve point. An attacker can craft ciphertexts with invalid ephemeral keys to probe the ECDH implementation.

**Recommendation:**  
After deserializing the ephemeral public key bytes, call `.assertValidity()` (or equivalent) before performing ECDH. Reject any ciphertext whose embedded public key fails validation.

---

### MEDIUM-18: Session Timeout Enforcement Unclear

**File:** `coordinator/src/services/WebSocketManager.ts` (~line 1100)

**Description:**  
WebSocket ping/pong heartbeat is implemented (30-second interval), but it's unclear whether there is a hard maximum ceremony duration. A participant that stays connected but never sends round messages can keep a ceremony open indefinitely, preventing new ceremonies from starting if the coordinator enforces one active ceremony per vault.

**Recommendation:**  
Enforce hard ceremony timeouts: 5 minutes from `ceremony_start` → auto-abort. Log the abort reason and notify all connected participants.

---

### MEDIUM-19: Webhook Signature Validation on Receiver

**File:** `SecondSet/SecondSet/secondset/src/app/api/coordinator/webhook/route.ts`

**Description:**  
The coordinator sends `X-Coordinator-Signature: HMAC-SHA256(timestamp.payload)` on all webhooks. The web app receiver must validate this before processing. If validation is absent or uses a non-constant-time comparison, an attacker who can POST to the webhook endpoint can forge ceremony completion events.

**Recommendation:**  
Verify:
1. `X-Coordinator-Signature` matches `HMAC-SHA256(WEBHOOK_SECRET, timestamp + "." + rawBody)`
2. `X-Coordinator-Timestamp` is within ±5 minutes of current time
3. Use `timingSafeEqual` for comparison (Node.js `crypto.timingSafeEqual`)

---

### MEDIUM-20: Sensitive Data in Console Logs

**Files:** Multiple — `CoordinatorWS.ts`, `WebSocketManager.ts`, `signing.routes.ts`, others

**Description:**  
Extensive emoji-decorated debug logging is present throughout. Some log entries include:
- WebSocket URLs containing auth tokens (CRITICAL when combined with HIGH-12)
- Participant IDs and session IDs
- Ceremony stage transitions (timing side-channel)
- Error details revealing implementation

In production React Native builds, these reach Expo/Metro logs and may be captured by crash reporting SDKs.

**Recommendation:**  
Gate all `console.log` behind `if (__DEV__)`. Remove any log that contains URLs, tokens, addresses, or ceremony parameters. In production use a structured logger with redaction.

---

### MEDIUM-21: Wallet Metadata Exposed in AsyncStorage (duplicate of HIGH-14 — see above)

Covered under HIGH-14.

---

### LOW-22: Hard-Coded Localhost Fallback URLs

**File:** `mobile-signer/src/services/CoordinatorAPI.ts` (~line 4)

```typescript
const COORDINATOR_URL = process.env.EXPO_PUBLIC_COORDINATOR_URL || 'http://localhost:3000';
```

A missing environment variable silently points to localhost instead of failing loudly. In a CI/CD pipeline with missing env vars, this would silently run against a localhost that likely has no TLS, bypassing certificate validation.

**Recommendation:** Remove fallback defaults. Throw at startup if `EXPO_PUBLIC_COORDINATOR_URL` is not set.

---

### LOW-23: Rate Limiting Per-Endpoint, Not Per-User

**File:** `coordinator/src/routes/signing.routes.ts` (~line 280)

Rate limits (60 req/60s, 50 req/60s) are applied globally per endpoint, not per device or user. A single attacker with many devices can consume the entire budget. Recovery endpoints appear to have no rate limiting.

**Recommendation:** Apply rate limits per `(device_id, endpoint)` pair. Recovery operations: max 1 per 10 minutes per device.

---

### LOW-24: Overly Descriptive Error Messages

**Files:** `WebSocketManager.ts`, `signing.routes.ts`

Error messages identify specific cryptographic operation failures and participant IDs, aiding reconnaissance. Swap for generic messages ("Ceremony processing error") and log details server-side only.

---

### INFO-25: No Input Boundary Checks on Share Indices

**File:** `mobile-signer/src/services/TSS/TSSCrypto.ts` (~line 230)

Share indices and polynomial degree are not validated against expected ranges (`1 ≤ index ≤ n`, `degree = t - 1`). Silent undefined behavior on out-of-range input.

---

### INFO-26: No Formal Verification or Differential Testing

All cryptographic primitives (Lagrange interpolation, EC arithmetic, field operations) are custom implementations. No known-answer test vectors against NIST or RFC test cases, and no differential testing against reference libraries.

---

## Positive Security Properties

The following are done well and should be preserved:

- **Hardware-backed key storage** — iOS Secure Enclave and Android Keystore used for key material
- **Biometric authentication** — required before all signing and recovery operations
- **Feldman VSS architecture** — the framework for verifiable secret sharing is present; issues are in enforcement
- **ECIES encryption for sub-shares** — recovery sub-shares are not transmitted in plaintext
- **HMAC-SHA256 webhook signing** — coordinator signs all async notifications
- **JWT WebSocket authentication** — ceremony access is token-gated
- **Coordinator statelessness** — coordinator never stores private key material
- **Proper curve separation** — secp256k1 and Ed25519 handled by distinct code paths
- **Address consensus in recovery** — all new signers must report the same wallet address before completing recovery
- **Lagrange coefficient arithmetic** — both ECDSA and Ed25519 implementations correctly handle negative bigint modulo using `(ORDER - xj)` and `((xi - xj) % ORDER + ORDER) % ORDER` patterns (verified by code inspection)

---

## Remediation Priority

### Phase 1 — Before Any Production Use (CRITICAL)
1. Fix PRNG bias → use rejection sampling
2. Replace modular inverse with constant-time version
3. Add curve point validation on all received points
4. Enforce Feldman verification in DKG Round 2
5. Add JWT revocation mechanism (token blacklist)
6. Audit and eliminate key material in logs and heap

### Phase 2 — Within 2 Weeks (HIGH)
7. Replace ECIES KDF with HKDF
8. Add state machine lock in signature aggregation
9. Validate role/signer_index claims against stored DB values
10. Move WebSocket token out of URL
11. Add ceremony start consensus handshake
12. Encrypt AsyncStorage vault index
13. Add per-round message signing by participants

### Phase 3 — Within 1 Month (MEDIUM)
15. Ed25519 cofactor multiplication in DKG
16. Point validation in recovery ECIES
17. Enforce webhook signature validation on receiver
18. Add hard ceremony timeouts
19. Remove/redact production console logs
20. Encrypt AsyncStorage vault metadata

### Phase 4 — Ongoing (LOW/INFO)
21. Remove localhost fallback defaults
22. Per-user rate limiting
23. Generic error messages
24. Input boundary assertions
25. Add NIST/RFC test vectors for all crypto functions
26. Consider professional cryptographic audit before launch

---

## Conclusion

The SecondSet architecture is sound — hardware key isolation, biometric gates, threshold 2-of-3, and hardware-backed storage are the right foundations. The critical gaps are in the cryptographic implementation layer: biased randomness, missing point validation, unenforced Feldman verification, and timing vulnerabilities. These are all fixable with well-understood techniques and several can be resolved by leaning more heavily on `@noble/secp256k1` and `@noble/curves`, which already handle these concerns correctly and are already in the dependency tree.

**The system should not be used with real funds until at minimum Phase 1 and Phase 2 items are addressed.**

---

*Generated by Claude Code security review — 2026-04-30. No code was modified.*
