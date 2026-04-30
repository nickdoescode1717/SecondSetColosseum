// Standalone test: Ed25519 threshold signing verification
// Run with: node test_ed25519_tss.mjs

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ed25519 } = require('@noble/curves/ed25519.js');
const { sha512 } = require('@noble/hashes/sha512');

const ED25519_ORDER = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');

// Discover the Point API
const Point = ed25519.ExtendedPoint || ed25519.Point;
if (!Point) {
  console.error('Cannot find Point class. ed25519 exports:', Object.keys(ed25519));
  process.exit(1);
}
console.log('Using Point class:', Point.name || 'anonymous');
console.log('Point.BASE exists:', !!Point.BASE);

// Discover toBytes method
const testPoint = Point.BASE;
const toBytes = testPoint.toRawBytes ? 'toRawBytes' : (testPoint.toBytes ? 'toBytes' : null);
if (!toBytes) {
  console.error('Cannot find toBytes method. Point prototype:', Object.getOwnPropertyNames(Object.getPrototypeOf(testPoint)));
  process.exit(1);
}
console.log('Using toBytes method:', toBytes);
console.log('');

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}

function randomScalar() {
  while (true) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const num = BigInt('0x' + bytesToHex(bytes));
    if (num > 0n && num < ED25519_ORDER) return num;
  }
}

function modInverse(a, m) {
  a = ((a % m) + m) % m;
  let [oldR, r] = [a, m];
  let [oldS, s] = [1n, 0n];
  while (r !== 0n) {
    const q = oldR / r;
    [oldR, r] = [r, oldR - q * r];
    [oldS, s] = [s, oldS - q * s];
  }
  return ((oldS % m) + m) % m;
}

// ========== DKG ==========

function dkgRound1(myIndex, allIndices) {
  const secret = randomScalar();
  const coefficient = randomScalar();
  const C0 = Point.BASE.multiply(secret);
  const C1 = Point.BASE.multiply(coefficient);
  const shares = {};
  for (const j of allIndices) {
    shares[j] = (secret + coefficient * BigInt(j)) % ED25519_ORDER;
  }
  return { secret, coefficient, C0, C1, shares };
}

function dkgRound2(myIndex, myRound1, otherRound1s) {
  const myShareToSelf = (myRound1.secret + myRound1.coefficient * BigInt(myIndex)) % ED25519_ORDER;
  let finalKeyShare = myShareToSelf;
  let combinedPubKey = myRound1.C0;

  for (const other of otherRound1s) {
    const share = other.shares[myIndex];
    finalKeyShare = (finalKeyShare + share) % ED25519_ORDER;
    combinedPubKey = combinedPubKey.add(other.C0);
  }

  return { finalKeyShare, combinedPubKey };
}

// ========== SIGNING (matching Ed25519Crypto.ts) ==========

function computeLagrange(signerIndex, allSignerIndices) {
  const xi = BigInt(signerIndex);
  let lambda = 1n;
  for (const j of allSignerIndices) {
    if (j === signerIndex) continue;
    const xj = BigInt(j);
    const numerator = (ED25519_ORDER - xj) % ED25519_ORDER;
    const denominator = ((xi - xj) % ED25519_ORDER + ED25519_ORDER) % ED25519_ORDER;
    lambda = (lambda * numerator % ED25519_ORDER * modInverse(denominator, ED25519_ORDER)) % ED25519_ORDER;
  }
  return lambda;
}

function computeChallenge(R_bytes, PK_bytes, msg_bytes) {
  const hashInput = new Uint8Array(R_bytes.length + PK_bytes.length + msg_bytes.length);
  hashInput.set(R_bytes, 0);
  hashInput.set(PK_bytes, R_bytes.length);
  hashInput.set(msg_bytes, R_bytes.length + PK_bytes.length);

  const hashOutput = sha512(hashInput);

  // Little-endian interpretation (RFC 8032)
  const hashLE = new Uint8Array(hashOutput);
  hashLE.reverse();
  return BigInt('0x' + bytesToHex(hashLE)) % ED25519_ORDER;
}

function createPartialSig(keyShare, nonce, signerIndex, signerIndices, combinedR_bytes, PK_bytes, msg_bytes) {
  const k_i = nonce;
  const x_i = keyShare;
  const lambda_i = computeLagrange(signerIndex, signerIndices);
  const e = computeChallenge(combinedR_bytes, PK_bytes, msg_bytes);

  const lambda_x = (lambda_i * x_i) % ED25519_ORDER;
  const e_lambda_x = (e * lambda_x) % ED25519_ORDER;
  const s_i = (k_i + e_lambda_x) % ED25519_ORDER;

  return { s_i, e, lambda_i };
}

// ========== TEST ==========

console.log('=== Ed25519 Threshold Signing Test ===\n');

// Step 1: DKG with 3 participants
const allIndices = [1, 2, 3];
const r1_1 = dkgRound1(1, allIndices);
const r1_2 = dkgRound1(2, allIndices);
const r1_3 = dkgRound1(3, allIndices);

const dkg1 = dkgRound2(1, r1_1, [r1_2, r1_3]);
const dkg2 = dkgRound2(2, r1_2, [r1_1, r1_3]);
const dkg3 = dkgRound2(3, r1_3, [r1_1, r1_2]);

// Verify all derive the same combined public key
const pk1Hex = bytesToHex(dkg1.combinedPubKey[toBytes]());
const pk2Hex = bytesToHex(dkg2.combinedPubKey[toBytes]());
const pk3Hex = bytesToHex(dkg3.combinedPubKey[toBytes]());
console.log('Combined PK match:', pk1Hex === pk2Hex && pk2Hex === pk3Hex);

const combinedPubKeyBytes = dkg1.combinedPubKey[toBytes]();
const fullSecret = (r1_1.secret + r1_2.secret + r1_3.secret) % ED25519_ORDER;
const fullPubKey = Point.BASE.multiply(fullSecret);
console.log('PK matches full secret * G:', bytesToHex(fullPubKey[toBytes]()) === pk1Hex);

// Verify Lagrange reconstruction: lambda_1*x_1 + lambda_2*x_2 == fullSecret (for signers 1,2)
const signerIndices = [1, 2];
const l1 = computeLagrange(1, signerIndices);
const l2 = computeLagrange(2, signerIndices);
const reconstructed = (l1 * dkg1.finalKeyShare + l2 * dkg2.finalKeyShare) % ED25519_ORDER;
console.log('Lagrange reconstruction matches full secret:', reconstructed === fullSecret);

// Step 2: Signing with signers 1 and 2
const message = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]); // test message

// Generate nonces
const k1 = randomScalar();
const k2 = randomScalar();
const R1 = Point.BASE.multiply(k1);
const R2 = Point.BASE.multiply(k2);

// Combine nonce points
const combinedR = R1.add(R2);
const combinedR_bytes = combinedR[toBytes]();

console.log('\nR1:', bytesToHex(R1[toBytes]()).slice(0, 40) + '...');
console.log('R2:', bytesToHex(R2[toBytes]()).slice(0, 40) + '...');
console.log('Combined R:', bytesToHex(combinedR_bytes).slice(0, 40) + '...');

// Create partial signatures
const sig1 = createPartialSig(dkg1.finalKeyShare, k1, 1, signerIndices, combinedR_bytes, combinedPubKeyBytes, message);
const sig2 = createPartialSig(dkg2.finalKeyShare, k2, 2, signerIndices, combinedR_bytes, combinedPubKeyBytes, message);

console.log('\nChallenge e (signer 1):', sig1.e.toString(16).slice(0, 40) + '...');
console.log('Challenge e (signer 2):', sig2.e.toString(16).slice(0, 40) + '...');
console.log('Challenges match:', sig1.e === sig2.e);

console.log('Lambda 1:', sig1.lambda_i.toString(16));
console.log('Lambda 2:', sig2.lambda_i.toString(16));

// Combine signatures (coordinator style: sum partial sigs)
const combinedS = (sig1.s_i + sig2.s_i) % ED25519_ORDER;

// Build signature: R (32 bytes) + s (32 bytes little-endian)
const sHexBE = combinedS.toString(16).padStart(64, '0');
const sBytesBE = hexToBytes(sHexBE);
const sBytesLE = new Uint8Array(sBytesBE);
sBytesLE.reverse();

const sigBytes = new Uint8Array(64);
sigBytes.set(combinedR_bytes, 0);
sigBytes.set(sBytesLE, 32);

// Verify with @noble/curves
console.log('\n=== Verification ===');
const verifyLE = ed25519.verify(sigBytes, message, combinedPubKeyBytes);
console.log('Verify (s as LE):', verifyLE);

// Also try s as BE
const sigBytesBE = new Uint8Array(64);
sigBytesBE.set(combinedR_bytes, 0);
sigBytesBE.set(sBytesBE, 32);
const verifyBE = ed25519.verify(sigBytesBE, message, combinedPubKeyBytes);
console.log('Verify (s as BE):', verifyBE);

// Manual verification: S * G == R + e * A
const sG = Point.BASE.multiply(combinedS);
const eA = fullPubKey.multiply(sig1.e);
const RpluseA = combinedR.add(eA);
console.log('\nManual verify: S*G == R + e*A:', sG.equals(RpluseA));

if (!sG.equals(RpluseA)) {
  console.log('  S*G:', bytesToHex(sG[toBytes]()));
  console.log('  R+e*A:', bytesToHex(RpluseA[toBytes]()));
}

// Also try a standard (non-threshold) Ed25519 signature to verify the challenge/encoding works
console.log('\n=== Control Test: Standard (non-threshold) Ed25519 ===');
const privKey = randomScalar();
const pubKey = Point.BASE.multiply(privKey);
const pubKeyBytes = pubKey[toBytes]();

const kNonce = randomScalar();
const RNonce = Point.BASE.multiply(kNonce);
const RNonceBytes = RNonce[toBytes]();

const eControl = computeChallenge(RNonceBytes, pubKeyBytes, message);
const sControl = (kNonce + eControl * privKey) % ED25519_ORDER;

const sControlHex = sControl.toString(16).padStart(64, '0');
const sControlBE = hexToBytes(sControlHex);
const sControlLE = new Uint8Array(sControlBE);
sControlLE.reverse();

const controlSig = new Uint8Array(64);
controlSig.set(RNonceBytes, 0);
controlSig.set(sControlLE, 32);

const controlVerify = ed25519.verify(controlSig, message, pubKeyBytes);
console.log('Standard sig verify (LE s):', controlVerify);

// Manual check: s*G == R + e*PK
const sGControl = Point.BASE.multiply(sControl);
const ePK = pubKey.multiply(eControl);
const RplusePK = RNonce.add(ePK);
console.log('Standard manual: S*G == R + e*PK:', sGControl.equals(RplusePK));

// ========== Summary ==========
console.log('\n=== Summary ===');
if (sG.equals(RpluseA)) {
  console.log('TSS math is CORRECT (S*G == R + e*A)');
  if (verifyLE) {
    console.log('Signature encoding is CORRECT (LE s)');
  } else if (verifyBE) {
    console.log('Signature encoding: need BE s (no reversal)');
  } else {
    console.log('Encoding issue: math is right but ed25519.verify() rejects');
    console.log('This means challenge hash or point encoding differs from standard Ed25519');
    if (controlVerify) {
      console.log('Control test PASSES — threshold-specific issue (Lagrange coefficients or partial sig formula)');
    } else {
      console.log('Control test also FAILS — challenge hash computation is wrong');
    }
  }
} else {
  console.log('TSS math is WRONG — investigate Lagrange, challenge, or partial sig computation');
  if (controlVerify) {
    console.log('Control test PASSES — issue is in threshold math, not challenge hash');
  } else {
    console.log('Control test also FAILS — challenge hash computation itself is wrong');
  }
}
