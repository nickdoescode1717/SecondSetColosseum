// mobile-signer/src/services/TSS/Ed25519Crypto.ts
//
// Ed25519 DKG (Feldman VSS) and threshold signing for Solana
// Mirrors TSSCrypto.ts structure but uses Ed25519 (twisted Edwards) instead of secp256k1

import { ed25519 } from '@noble/curves/ed25519.js';
import { sha512 } from '@noble/hashes/sha2.js';
import bs58 from 'bs58';

// Ed25519 curve order (l)
const ED25519_ORDER = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');

// Secure random number generation
function getRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}

// Generate a random scalar in [1, l-1]
function randomScalar(): bigint {
  while (true) {
    const bytes = getRandomBytes(32);
    const num = BigInt('0x' + bytesToHex(bytes));
    if (num > 0n && num < ED25519_ORDER) {
      return num;
    }
  }
}

// Modular inverse using Extended Euclidean Algorithm
function modInverse(a: bigint, m: bigint): bigint {
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

// Scalar to 32-byte little-endian Uint8Array (Ed25519 convention)
function scalarToBytes(scalar: bigint): Uint8Array {
  const hex = scalar.toString(16).padStart(64, '0');
  const bytes = hexToBytes(hex);
  // Reverse for little-endian
  bytes.reverse();
  return bytes;
}

// 32-byte little-endian Uint8Array to scalar
function bytesToScalar(bytes: Uint8Array): bigint {
  const reversed = new Uint8Array(bytes);
  reversed.reverse();
  return BigInt('0x' + bytesToHex(reversed));
}

/**
 * Ed25519 DKG - Distributed Key Generation using Feldman VSS on Ed25519
 */
export class Ed25519Keygen {
  /**
   * DKG Round 1: Generate secret polynomial, commitments, and shares.
   * Same structure as secp256k1 TSSKeygen but on the Ed25519 curve.
   *
   * Polynomial: f(x) = secret + coefficient * x (mod l)
   * Commitments: C0 = secret * G, C1 = coefficient * G (on Ed25519)
   * Shares: f(j) for each participant j
   */
  static generateRound1(myIndex: number, allIndices: number[]): {
    secret: string;
    coefficient: string;
    commitments: [string, string]; // [C0, C1] compressed Ed25519 point hex
    shares: Record<number, string>;
  } {
    console.log(`Ed25519 DKG Round 1: Generating polynomial for participant ${myIndex}`);

    const secret = randomScalar();
    const coefficient = randomScalar();

    // Commitments: C0 = secret * G, C1 = coefficient * G on Ed25519
    const C0Point = ed25519.Point.BASE.multiply(secret);
    const C1Point = ed25519.Point.BASE.multiply(coefficient);
    const C0 = bytesToHex(C0Point.toBytes());
    const C1 = bytesToHex(C1Point.toBytes());

    // Compute shares: f(j) = secret + coefficient * j (mod l)
    const shares: Record<number, string> = {};
    for (const j of allIndices) {
      const share = (secret + coefficient * BigInt(j)) % ED25519_ORDER;
      shares[j] = share.toString(16).padStart(64, '0');
    }

    return {
      secret: secret.toString(16).padStart(64, '0'),
      coefficient: coefficient.toString(16).padStart(64, '0'),
      commitments: [C0, C1],
      shares,
    };
  }

  /**
   * DKG Round 2: Verify received shares and compute final key share + combined public key.
   *
   * Feldman verification on Ed25519: share * G == C0 + myIndex * C1
   * Final key share: x_j = sum of all f_i(j)
   * Combined public key: Y = sum of all C_i0
   * Solana address: base58(Y) (32-byte compressed Ed25519 public key)
   */
  static processRound2(
    myIndex: number,
    myRound1: { secret: string; coefficient: string; commitments: [string, string] },
    receivedData: Array<{
      fromIndex: number;
      commitments: [string, string];
      share: string;
    }>
  ): {
    finalKeyShare: string;
    combinedPublicKey: string;
    walletAddress: string;
  } {
    console.log(`Ed25519 DKG Round 2: Processing ${receivedData.length} received shares`);

    const mySecret = BigInt('0x' + myRound1.secret);
    const myCoefficient = BigInt('0x' + myRound1.coefficient);
    const myShareToSelf = (mySecret + myCoefficient * BigInt(myIndex)) % ED25519_ORDER;

    let finalKeyShare = myShareToSelf;

    // Start combined public key with my C0
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
      console.log(`Share from participant ${data.fromIndex} verified (Ed25519)`);

      // Accumulate
      finalKeyShare = (finalKeyShare + share) % ED25519_ORDER;
      combinedPubKey = combinedPubKey.add(C0);
    }

    const combinedPubKeyHex = bytesToHex(combinedPubKey.toBytes());
    const walletAddress = Ed25519Keygen.deriveAddress(combinedPubKeyHex);

    return {
      finalKeyShare: finalKeyShare.toString(16).padStart(64, '0'),
      combinedPublicKey: combinedPubKeyHex,
      walletAddress,
    };
  }

  /**
   * Derive Solana address from Ed25519 public key.
   * Solana address = base58 encoding of the 32-byte compressed Ed25519 public key.
   * No hashing — the public key IS the address.
   */
  static deriveAddress(publicKeyHex: string): string {
    const cleanHex = publicKeyHex.startsWith('0x') ? publicKeyHex.slice(2) : publicKeyHex;
    const pubKeyBytes = hexToBytes(cleanHex);

    if (pubKeyBytes.length !== 32) {
      throw new Error(`Expected 32-byte Ed25519 public key, got ${pubKeyBytes.length} bytes`);
    }

    return bs58.encode(pubKeyBytes);
  }
}

/**
 * Ed25519 Threshold Signing (2-of-3)
 *
 * Key differences from ECDSA:
 * - Each signer uses their OWN nonce scalar (not the combined nonce)
 * - Each signer pre-multiplies their key share by their Lagrange coefficient
 * - Partial sig: s_i = k_i + e * (lambda_i * x_i) mod l
 * - Coordinator SUMS partial signatures (no Lagrange interpolation needed)
 * - Challenge: e = SHA-512(R || PK || message) per Ed25519 spec
 */
export class Ed25519Signing {
  /**
   * Generate ephemeral nonce and nonce point for Ed25519 signing
   */
  static generateNonce(): { nonce: string; noncePoint: string } {
    const k = randomScalar();
    const R = ed25519.Point.BASE.multiply(k);
    const noncePoint = bytesToHex(R.toBytes());

    return {
      nonce: k.toString(16).padStart(64, '0'),
      noncePoint,
    };
  }

  /**
   * Combine two Ed25519 nonce points: R = R_1 + R_2
   */
  static combineNoncePoints(point1Hex: string, point2Hex: string): string {
    const p1 = ed25519.Point.fromHex(point1Hex);
    const p2 = ed25519.Point.fromHex(point2Hex);
    const combined = p1.add(p2);
    return bytesToHex(combined.toBytes());
  }

  /**
   * Compute Lagrange coefficient for a given signer index
   * lambda_i = product over j!=i of (0 - x_j) / (x_i - x_j) mod l
   * For 2-of-3 with specific signer indices, this simplifies.
   */
  static computeLagrangeCoefficient(signerIndex: number, allSignerIndices: number[]): bigint {
    const xi = BigInt(signerIndex);
    let lambda = 1n;

    for (const j of allSignerIndices) {
      if (j === signerIndex) continue;
      const xj = BigInt(j);
      // lambda *= (0 - xj) / (xi - xj) mod l
      const numerator = (ED25519_ORDER - xj) % ED25519_ORDER;
      const denominator = ((xi - xj) % ED25519_ORDER + ED25519_ORDER) % ED25519_ORDER;
      lambda = (lambda * numerator % ED25519_ORDER * modInverse(denominator, ED25519_ORDER)) % ED25519_ORDER;
    }

    return lambda;
  }

  /**
   * Create partial Ed25519 signature.
   *
   * s_i = k_i + e * (lambda_i * x_i) mod l
   *
   * Where:
   * - k_i is this signer's nonce scalar (NOT the combined nonce)
   * - e is the Ed25519 challenge: SHA-512(R || PK || message) reduced mod l
   * - lambda_i is this signer's Lagrange coefficient
   * - x_i is this signer's key share
   */
  static createPartialSignature(
    keyShare: string,
    messageHash: string,
    signerIndex: number,
    signerIndices: number[],
    combinedNoncePointHex: string,
    combinedPublicKeyHex: string,
    nonce: string,
  ): {
    partialSignature: string;
    noncePoint: string;
  } {
    const k_i = BigInt('0x' + (nonce.startsWith('0x') ? nonce.slice(2) : nonce));
    const x_i = BigInt('0x' + (keyShare.startsWith('0x') ? keyShare.slice(2) : keyShare));

    // Compute Lagrange coefficient
    const lambda_i = Ed25519Signing.computeLagrangeCoefficient(signerIndex, signerIndices);

    // Compute challenge e = SHA-512(R || PK || message) mod l
    const R_bytes = hexToBytes(combinedNoncePointHex.startsWith('0x') ? combinedNoncePointHex.slice(2) : combinedNoncePointHex);
    const PK_bytes = hexToBytes(combinedPublicKeyHex.startsWith('0x') ? combinedPublicKeyHex.slice(2) : combinedPublicKeyHex);
    const msg_bytes = hexToBytes(messageHash.startsWith('0x') ? messageHash.slice(2) : messageHash);

    console.log('[Ed25519 Diag] createPartialSignature inputs:');
    console.log('  signerIndex:', signerIndex, 'signerIndices:', signerIndices);
    console.log('  R bytes (%d): %s', R_bytes.length, bytesToHex(R_bytes).slice(0, 40));
    console.log('  PK bytes (%d): %s', PK_bytes.length, bytesToHex(PK_bytes).slice(0, 40));
    console.log('  msg bytes (%d): %s', msg_bytes.length, bytesToHex(msg_bytes).slice(0, 40));
    console.log('  lambda_i:', lambda_i.toString(16).slice(0, 20));

    const hashInput = new Uint8Array(R_bytes.length + PK_bytes.length + msg_bytes.length);
    hashInput.set(R_bytes, 0);
    hashInput.set(PK_bytes, R_bytes.length);
    hashInput.set(msg_bytes, R_bytes.length + PK_bytes.length);

    const hashOutput = sha512(hashInput);
    // Ed25519 (RFC 8032): interpret SHA-512 output as little-endian integer, then reduce mod l
    const hashLE = new Uint8Array(hashOutput);
    hashLE.reverse();
    const e = BigInt('0x' + bytesToHex(hashLE)) % ED25519_ORDER;

    console.log('  challenge e:', e.toString(16).slice(0, 40));

    // s_i = k_i + e * (lambda_i * x_i) mod l
    const lambda_x = (lambda_i * x_i) % ED25519_ORDER;
    const e_lambda_x = (e * lambda_x) % ED25519_ORDER;
    const s_i = (k_i + e_lambda_x) % ED25519_ORDER;

    console.log('  partial sig s_i:', s_i.toString(16).slice(0, 20));

    // Return nonce point for this signer (so coordinator can combine R)
    const R_i = ed25519.Point.BASE.multiply(k_i);

    return {
      partialSignature: s_i.toString(16).padStart(64, '0'),
      noncePoint: bytesToHex(R_i.toBytes()),
    };
  }
}
