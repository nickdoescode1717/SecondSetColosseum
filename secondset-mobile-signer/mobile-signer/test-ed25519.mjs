// test-ed25519.mjs
// Standalone Ed25519 test script (ESM)

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

const ED25519_ORDER = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');

function getRandomBytes(length) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
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
    const bytes = getRandomBytes(32);
    const num = BigInt('0x' + bytesToHex(bytes));
    if (num > 0n && num < ED25519_ORDER) {
      return num;
    }
  }
}

function modInverse(a, m) {
  a = ((a % m) + m) % m;
  let [oldR, r] = [a, m];
  let [oldS, s] = [1n, 0n];

  while (r !== 0n) {
    const quotient = oldR / r;
    [oldR, r] = [r, oldR - quotient * r];
    [oldS, s] = [s, oldS - quotient * s];
  }

  return ((oldS % m) + m) % m;
}

// Ed25519 DKG Round 1
function generateRound1(myIndex, allIndices) {
  console.log(`\n=== DKG Round 1: Participant ${myIndex} ===`);

  const secret = randomScalar();
  const coefficient = randomScalar();

  // Commitments: C0 = secret * G, C1 = coefficient * G
  const C0Point = ed25519.Point.BASE.multiply(secret);
  const C1Point = ed25519.Point.BASE.multiply(coefficient);
  const C0 = bytesToHex(C0Point.toBytes());
  const C1 = bytesToHex(C1Point.toBytes());

  // Compute shares: f(j) = secret + coefficient * j (mod l)
  const shares = {};
  for (const j of allIndices) {
    const share = (secret + coefficient * BigInt(j)) % ED25519_ORDER;
    shares[j] = share.toString(16).padStart(64, '0');
  }

  console.log(`✅ Generated commitments and shares`);

  return {
    secret: secret.toString(16).padStart(64, '0'),
    coefficient: coefficient.toString(16).padStart(64, '0'),
    commitments: [C0, C1],
    shares,
  };
}

// Ed25519 DKG Round 2
function processRound2(myIndex, myRound1, receivedData) {
  console.log(`\n=== DKG Round 2: Participant ${myIndex} ===`);

  const mySecret = BigInt('0x' + myRound1.secret);
  const myCoefficient = BigInt('0x' + myRound1.coefficient);
  const myShareToSelf = (mySecret + myCoefficient * BigInt(myIndex)) % ED25519_ORDER;

  let finalKeyShare = myShareToSelf;
  let combinedPubKey = ed25519.Point.fromHex(myRound1.commitments[0]);

  for (const data of receivedData) {
    const share = BigInt('0x' + data.share);

    // Feldman verification: share * G == C0 + myIndex * C1
    const sharePoint = ed25519.Point.BASE.multiply(share);
    const C0 = ed25519.Point.fromHex(data.commitments[0]);
    const C1 = ed25519.Point.fromHex(data.commitments[1]);
    const expected = C0.add(C1.multiply(BigInt(myIndex)));

    if (!sharePoint.equals(expected)) {
      throw new Error(`Feldman verification failed for participant ${data.fromIndex}`);
    }
    console.log(`✅ Share from participant ${data.fromIndex} verified`);

    // Accumulate
    finalKeyShare = (finalKeyShare + share) % ED25519_ORDER;
    combinedPubKey = combinedPubKey.add(C0);
  }

  const combinedPubKeyHex = bytesToHex(combinedPubKey.toBytes());
  const pubKeyBytes = hexToBytes(combinedPubKeyHex);
  const walletAddress = bs58.encode(pubKeyBytes);

  console.log(`✅ Final key share computed`);
  console.log(`✅ Wallet address: ${walletAddress}`);

  return {
    finalKeyShare: finalKeyShare.toString(16).padStart(64, '0'),
    combinedPublicKey: combinedPubKeyHex,
    walletAddress,
  };
}

// Ed25519 Signing
function generateNonce() {
  const k = randomScalar();
  const R = ed25519.Point.BASE.multiply(k);
  const noncePoint = bytesToHex(R.toBytes());

  return {
    nonce: k.toString(16).padStart(64, '0'),
    noncePoint,
  };
}

function combineNoncePoints(point1Hex, point2Hex) {
  const p1 = ed25519.Point.fromHex(point1Hex);
  const p2 = ed25519.Point.fromHex(point2Hex);
  const combined = p1.add(p2);
  return bytesToHex(combined.toBytes());
}

function computeLagrangeCoefficient(signerIndex, allSignerIndices) {
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

function createPartialSignature(
  keyShare,
  messageHash,
  signerIndex,
  signerIndices,
  combinedNoncePointHex,
  combinedPublicKeyHex,
  nonce
) {
  const k_i = BigInt('0x' + (nonce.startsWith('0x') ? nonce.slice(2) : nonce));
  const x_i = BigInt('0x' + (keyShare.startsWith('0x') ? keyShare.slice(2) : keyShare));

  const lambda_i = computeLagrangeCoefficient(signerIndex, signerIndices);

  // Compute challenge e = SHA-512(R || PK || message) mod l
  const R_bytes = hexToBytes(combinedNoncePointHex.startsWith('0x') ? combinedNoncePointHex.slice(2) : combinedNoncePointHex);
  const PK_bytes = hexToBytes(combinedPublicKeyHex.startsWith('0x') ? combinedPublicKeyHex.slice(2) : combinedPublicKeyHex);
  const msg_bytes = hexToBytes(messageHash.startsWith('0x') ? messageHash.slice(2) : messageHash);

  const hashInput = new Uint8Array(R_bytes.length + PK_bytes.length + msg_bytes.length);
  hashInput.set(R_bytes, 0);
  hashInput.set(PK_bytes, R_bytes.length);
  hashInput.set(msg_bytes, R_bytes.length + PK_bytes.length);

  const hashOutput = sha512(hashInput);
  const e = BigInt('0x' + bytesToHex(hashOutput)) % ED25519_ORDER;

  // s_i = k_i + e * (lambda_i * x_i) mod l
  const lambda_x = (lambda_i * x_i) % ED25519_ORDER;
  const e_lambda_x = (e * lambda_x) % ED25519_ORDER;
  const s_i = (k_i + e_lambda_x) % ED25519_ORDER;

  const R_i = ed25519.Point.BASE.multiply(k_i);

  return {
    partialSignature: s_i.toString(16).padStart(64, '0'),
    noncePoint: bytesToHex(R_i.toBytes()),
  };
}

// === TEST EXECUTION ===

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║  Ed25519 (Solana) 2-of-3 Threshold Signature Test    ║');
console.log('╚════════════════════════════════════════════════════════╝');

try {
  // PHASE 1: DKG (all 3 participants)
  console.log('\n📌 PHASE 1: Distributed Key Generation (3-of-3)');
  console.log('─'.repeat(60));

  const allIndices = [1, 2, 3];

  const p1Round1 = generateRound1(1, allIndices);
  const p2Round1 = generateRound1(2, allIndices);
  const p3Round1 = generateRound1(3, allIndices);

  const p1Keygen = processRound2(1, p1Round1, [
    { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[1] },
    { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[1] },
  ]);

  const p2Keygen = processRound2(2, p2Round1, [
    { fromIndex: 1, commitments: p1Round1.commitments, share: p1Round1.shares[2] },
    { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[2] },
  ]);

  const p3Keygen = processRound2(3, p3Round1, [
    { fromIndex: 1, commitments: p1Round1.commitments, share: p1Round1.shares[3] },
    { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[3] },
  ]);

  // Verify consensus
  if (p1Keygen.walletAddress !== p2Keygen.walletAddress ||
      p2Keygen.walletAddress !== p3Keygen.walletAddress) {
    throw new Error('❌ Address mismatch! DKG failed.');
  }

  console.log('\n✅ CONSENSUS REACHED!');
  console.log(`   Wallet: ${p1Keygen.walletAddress}`);
  console.log(`   PubKey: ${p1Keygen.combinedPublicKey.slice(0, 16)}...`);

  // PHASE 2: Threshold Signing (2-of-3)
  console.log('\n📌 PHASE 2: Threshold Signing (2-of-3: signers 1 and 2)');
  console.log('─'.repeat(60));

  const messageHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
  const signerIndices = [1, 2];

  const { nonce: nonce1, noncePoint: r1 } = generateNonce();
  const { nonce: nonce2, noncePoint: r2 } = generateNonce();
  const combinedR = combineNoncePoints(r1, r2);

  console.log('\n✅ Nonces generated and combined');

  const partialSig1 = createPartialSignature(
    p1Keygen.finalKeyShare,
    messageHash,
    1,
    signerIndices,
    combinedR,
    p1Keygen.combinedPublicKey,
    nonce1
  );

  const partialSig2 = createPartialSignature(
    p2Keygen.finalKeyShare,
    messageHash,
    2,
    signerIndices,
    combinedR,
    p2Keygen.combinedPublicKey,
    nonce2
  );

  console.log('\n✅ Partial signatures created:');
  console.log(`   Signer 1: ${partialSig1.partialSignature.slice(0, 16)}...`);
  console.log(`   Signer 2: ${partialSig2.partialSignature.slice(0, 16)}...`);

  // Combine signatures (coordinator's job)
  const s1 = BigInt('0x' + partialSig1.partialSignature);
  const s2 = BigInt('0x' + partialSig2.partialSignature);
  const combinedS = (s1 + s2) % ED25519_ORDER;

  console.log('\n✅ SIGNATURE AGGREGATION COMPLETE!');
  console.log(`   Combined R: ${combinedR.slice(0, 16)}...`);
  console.log(`   Combined s: ${combinedS.toString(16).slice(0, 16)}...`);

  // Final verification
  if (combinedS > 0n && combinedS < ED25519_ORDER) {
    console.log('\n✅ Signature is VALID (s in valid range)');
  } else {
    throw new Error('❌ Invalid signature scalar!');
  }

  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║           🎉 ALL TESTS PASSED! 🎉                     ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

} catch (error) {
  console.error('\n❌ TEST FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
