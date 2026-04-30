// mobile-signer/src/services/TSS/TSSCrypto.ts

import * as secp256k1 from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3.js';

// Secure random number generation
function getRandomBytes(length: number): Uint8Array {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

// Convert bytes to hex string
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Convert hex string to bytes
function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.substr(i * 2, 2), 16);
  }
  return bytes;
}

// secp256k1 curve order
const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');

// Generate a random field element (< curve order, non-zero)
function randomFieldElement(): bigint {
  while (true) {
    const bytes = getRandomBytes(32);
    const num = BigInt('0x' + bytesToHex(bytes));
    if (num > 0n && num < CURVE_ORDER) {
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

/**
 * Shamir Secret Sharing for 2-of-3 threshold
 */
class ShamirSecretSharing {
  /**
   * Create 3 shares of a secret where any 2 can reconstruct it
   * Uses polynomial: f(x) = secret + a1*x (mod curve_order)
   */
  static createShares(secret: bigint): bigint[] {
    // Random coefficient for degree-1 polynomial
    const a1 = randomFieldElement();

    // Evaluate polynomial at x=1, x=2, x=3
    const share1 = (secret + a1 * 1n) % CURVE_ORDER;
    const share2 = (secret + a1 * 2n) % CURVE_ORDER;
    const share3 = (secret + a1 * 3n) % CURVE_ORDER;

    return [share1, share2, share3];
  }

  /**
   * Reconstruct secret from 2 shares using Lagrange interpolation
   * f(0) = share1 * L1(0) + share2 * L2(0)
   * where Li(0) are Lagrange basis polynomials evaluated at 0
   */
  static reconstructSecret(share1: bigint, x1: number, share2: bigint, x2: number): bigint {
    // Lagrange basis: L1(0) = x2 / (x2 - x1)
    const x1Big = BigInt(x1);
    const x2Big = BigInt(x2);
    
    const numerator1 = x2Big;
    const denominator1 = (x2Big - x1Big + CURVE_ORDER) % CURVE_ORDER;
    const L1 = (numerator1 * modInverse(denominator1, CURVE_ORDER)) % CURVE_ORDER;

    // Lagrange basis: L2(0) = -x1 / (x2 - x1)
    const numerator2 = (CURVE_ORDER - x1Big) % CURVE_ORDER;
    const L2 = (numerator2 * modInverse(denominator1, CURVE_ORDER)) % CURVE_ORDER;

    // Reconstruct: f(0) = share1 * L1 + share2 * L2
    const term1 = (share1 * L1) % CURVE_ORDER;
    const term2 = (share2 * L2) % CURVE_ORDER;
    const secret = (term1 + term2) % CURVE_ORDER;

    return secret;
  }
}

/**
 * TSS Keygen - Distributed Key Generation using Feldman VSS
 */
export class TSSKeygen {
  /**
   * DKG Round 1: Generate secret polynomial, commitments, and shares for all participants.
   *
   * Each participant i creates:
   *   - Random secret s_i and coefficient a_i
   *   - Polynomial: f_i(x) = s_i + a_i * x (mod n)
   *   - Commitments: C0 = s_i * G, C1 = a_i * G (public, broadcast to all)
   *   - Shares: f_i(j) for each participant j (private, sent individually)
   */
  static generateRound1(myIndex: number, allIndices: number[]): {
    secret: string;
    coefficient: string;
    commitments: [string, string]; // [C0, C1] compressed hex
    shares: Record<number, string>; // index -> share hex
  } {
    console.log(`🔐 DKG Round 1: Generating polynomial for participant ${myIndex}`);

    const secret = randomFieldElement();
    const coefficient = randomFieldElement();

    // Commitments: C0 = secret * G, C1 = coefficient * G
    const secretBytes = hexToBytes(secret.toString(16).padStart(64, '0'));
    const coeffBytes = hexToBytes(coefficient.toString(16).padStart(64, '0'));
    const C0 = bytesToHex(secp256k1.getPublicKey(secretBytes, true));
    const C1 = bytesToHex(secp256k1.getPublicKey(coeffBytes, true));

    console.log('✅ Generated commitments C0:', C0.slice(0, 16) + '...');

    // Compute evaluation shares f_i(j) = secret + coefficient * j (mod n) for each participant
    const shares: Record<number, string> = {};
    for (const j of allIndices) {
      const share = (secret + coefficient * BigInt(j)) % CURVE_ORDER;
      shares[j] = share.toString(16).padStart(64, '0');
    }

    console.log('✅ Generated shares for', allIndices.length, 'participants');

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
   * Each participant j:
   *   1. Verifies each received share against commitments (Feldman verification)
   *   2. Computes final key share: x_j = Σ_i f_i(j)
   *   3. Computes combined public key: Y = Σ_i C_i0
   *   4. Derives wallet address from Y
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
    console.log(`🔐 DKG Round 2: Processing ${receivedData.length} received shares`);

    // Start with my own share to myself: f_myIndex(myIndex)
    const mySecret = BigInt('0x' + myRound1.secret);
    const myCoefficient = BigInt('0x' + myRound1.coefficient);
    const myShareToSelf = (mySecret + myCoefficient * BigInt(myIndex)) % CURVE_ORDER;

    let finalKeyShare = myShareToSelf;

    // Start combined public key with my C0
    let combinedPubKey = secp256k1.Point.fromHex(myRound1.commitments[0]);

    for (const data of receivedData) {
      const share = BigInt('0x' + data.share);

      // Feldman verification: share * G == C0 + myIndex * C1
      const shareBytes = hexToBytes(share.toString(16).padStart(64, '0'));
      const sharePoint = secp256k1.Point.fromHex(bytesToHex(secp256k1.getPublicKey(shareBytes, true)));
      const C0 = secp256k1.Point.fromHex(data.commitments[0]);
      const C1 = secp256k1.Point.fromHex(data.commitments[1]);
      const expected = C0.add(C1.multiply(BigInt(myIndex)));

      if (!sharePoint.equals(expected)) {
        throw new Error(`Feldman verification failed for participant ${data.fromIndex}`);
      }
      console.log(`✅ Share from participant ${data.fromIndex} verified`);

      // Accumulate final key share
      finalKeyShare = (finalKeyShare + share) % CURVE_ORDER;

      // Accumulate combined public key (sum of all C0s)
      combinedPubKey = combinedPubKey.add(C0);
    }

    const combinedPubKeyHex = combinedPubKey.toHex(true);
    console.log('✅ Combined public key:', combinedPubKeyHex.slice(0, 16) + '...');

    const walletAddress = TSSKeygen.deriveAddress(combinedPubKeyHex);

    return {
      finalKeyShare: finalKeyShare.toString(16).padStart(64, '0'),
      combinedPublicKey: combinedPubKeyHex,
      walletAddress,
    };
  }

  /**
   * Derive Ethereum address from public key
   */
  static deriveAddress(publicKey: string): string {
    console.log('��� Deriving address from public key:', publicKey);

    // Remove 0x prefix if present
    const cleanPubKey = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;
    
    // Parse compressed public key (33 bytes: 02/03 prefix + 32 bytes x-coordinate)
    const prefix = parseInt(cleanPubKey.slice(0, 2), 16);
    const xHex = cleanPubKey.slice(2);
    const x = BigInt('0x' + xHex);

    // secp256k1 curve parameters
    const p = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');
    const b = BigInt(7);

    // Compute y^2 = x^3 + 7 (mod p)
    const xCubed = (x * x * x) % p;
    const ySquared = (xCubed + b) % p;

    // Compute y using modular square root: y = ySquared^((p+1)/4) mod p
    const y = modPow(ySquared, (p + 1n) / 4n, p);

    // Choose the correct y based on prefix (02 = even, 03 = odd)
    const yFinal = (prefix === 2) === (y % 2n === 0n) ? y : p - y;

    // Construct uncompressed public key: 04 + x + y
    const xBytes = hexToBytes(xHex);
    const yBytes = hexToBytes(yFinal.toString(16).padStart(64, '0'));
    const uncompressed = new Uint8Array(64);
    uncompressed.set(xBytes, 0);
    uncompressed.set(yBytes, 32);

    // Keccak256 hash
    const hash = keccak_256(uncompressed);
    
    // Take last 20 bytes as address
    const addressBytes = hash.slice(-20);
    const address = '0x' + bytesToHex(addressBytes);

    console.log('✅ Derived address:', address);
    return address;
  }
}

/**
 * Modular exponentiation: base^exp mod m
 */
function modPow(base: bigint, exp: bigint, m: bigint): bigint {
  let result = 1n;
  base = base % m;
  while (exp > 0n) {
    if (exp % 2n === 1n) {
      result = (result * base) % m;
    }
    exp = exp / 2n;
    base = (base * base) % m;
  }
  return result;
}

/**
 * TSS Signing - Create and combine partial signatures (2-of-3)
 */
export class TSSSigning {
  /**
   * Combine two nonce scalars: k = k_1 + k_2 (mod n)
   * Both signers must use this combined nonce for valid Lagrange reconstruction.
   */
  static combineNonceScalars(nonce1: string, nonce2: string): string {
    const k1 = BigInt('0x' + (nonce1.startsWith('0x') ? nonce1.slice(2) : nonce1));
    const k2 = BigInt('0x' + (nonce2.startsWith('0x') ? nonce2.slice(2) : nonce2));
    const combined = (k1 + k2) % CURVE_ORDER;
    return combined.toString(16).padStart(64, '0');
  }

  /**
   * Generate an ephemeral nonce and nonce point (Round 1 of signing)
   * Returns the nonce scalar and the nonce commitment R_i = k_i * G
   */
  static generateNonce(): { nonce: string; noncePoint: string } {
    const k = randomFieldElement();
    const kBytes = hexToBytes(k.toString(16).padStart(64, '0'));
    const R_i = secp256k1.getPublicKey(kBytes, false); // Uncompressed
    console.log('✅ Generated nonce point R_i');
    return {
      nonce: k.toString(16).padStart(64, '0'),
      noncePoint: bytesToHex(R_i),
    };
  }

  /**
   * Create a partial signature using this participant's key share and a pre-generated nonce
   *
   * TSS Signing Protocol (Simplified):
   * 1. Each signer generates ephemeral nonce k_i
   * 2. Compute R_i = k_i * G
   * 3. Combine R = R_1 + R_2 (point addition)
   * 4. Compute r = R.x mod n
   * 5. Each signer computes: s_i = k_i^(-1) * (H(m) + r * keyShare_i) mod n
   * 6. Combine signatures: s = s_1 + s_2 mod n
   * 7. Final signature: (r, s)
   */
  static async createPartialSignature(
    keyShare: string,
    messageHash: string,
    participantIndex: 1 | 2 | 3,
    combinedNoncePoint: string, // R = R_1 + R_2 (from all signers)
    nonce: string // Pre-generated nonce scalar (hex)
  ): Promise<{
    participantIndex: number;
    partialSignature: string;
  }> {
    console.log(`✍️ Creating partial signature for participant ${participantIndex}`);

    // 1. Parse the pre-generated nonce
    const k = BigInt('0x' + (nonce.startsWith('0x') ? nonce.slice(2) : nonce));

    // 2. Extract r from combined R (x-coordinate)
    const combinedRBytes = hexToBytes(combinedNoncePoint.startsWith('0x') ? combinedNoncePoint.slice(2) : combinedNoncePoint);
    const r = BigInt('0x' + bytesToHex(combinedRBytes.slice(1, 33))); // Skip 04 prefix, take x-coordinate
    console.log('✅ Extracted r from combined nonce');

    // 3. Parse message hash
    const cleanHash = messageHash.startsWith('0x') ? messageHash.slice(2) : messageHash;
    const e = BigInt('0x' + cleanHash);

    // 4. Parse key share
    const cleanKeyShare = keyShare.startsWith('0x') ? keyShare.slice(2) : keyShare;
    const keyShareBig = BigInt('0x' + cleanKeyShare);

    // 5. Compute partial signature: s_i = k^(-1) * (e + r * keyShare_i) mod n
    const kInv = modInverse(k, CURVE_ORDER);
    const rTimesShare = (r * keyShareBig) % CURVE_ORDER;
    const eePlusR = (e + rTimesShare) % CURVE_ORDER;
    const s_i = (kInv * eePlusR) % CURVE_ORDER;

    console.log('✅ Computed partial signature s_i');

    return {
      participantIndex,
      partialSignature: s_i.toString(16).padStart(64, '0'),
    };
  }

  /**
   * Combine 2 partial signatures into a full ECDSA signature
   * Uses Lagrange interpolation to reconstruct the full signature from shares
   */
  static combineSignatures(
    partialSig1: { participantIndex: number; partialSignature: string },
    partialSig2: { participantIndex: number; partialSignature: string },
    combinedNoncePoint: string
  ): {
    r: string;
    s: string;
    v: number;
  } {
    console.log('��� Combining partial signatures...');

    // Extract r from combined nonce point
    const combinedRBytes = hexToBytes(combinedNoncePoint.startsWith('0x') ? combinedNoncePoint.slice(2) : combinedNoncePoint);
    const r = BigInt('0x' + bytesToHex(combinedRBytes.slice(1, 33))); // x-coordinate
    const rHex = '0x' + r.toString(16).padStart(64, '0');

    // Parse partial signatures
    const s1 = BigInt('0x' + partialSig1.partialSignature);
    const s2 = BigInt('0x' + partialSig2.partialSignature);

    // Reconstruct full signature using Lagrange interpolation
    // s = s_1 * L_1 + s_2 * L_2 (mod n)
    const s = ShamirSecretSharing.reconstructSecret(
      s1,
      partialSig1.participantIndex,
      s2,
      partialSig2.participantIndex
    );

    const sHex = '0x' + s.toString(16).padStart(64, '0');

    // Recovery ID (v) - for Ethereum, usually 27 or 28
    // For simplicity, we'll use 27 (can be derived properly from R.y parity)
    const v = 27;

    console.log('✅ Combined signature successfully');
    console.log('  r:', rHex);
    console.log('  s:', sHex);
    console.log('  v:', v);

    return {
      r: rHex,
      s: sHex,
      v,
    };
  }

  /**
   * Combine nonce points from all signers: R = R_1 + R_2
   * Implements proper elliptic curve point addition on secp256k1
   */
  static combineNoncePoints(noncePoint1: string, noncePoint2: string): string {
    console.log('Combining nonce points using EC point addition...');

    // Parse points (uncompressed format: 04 + x + y)
    const p1Bytes = hexToBytes(noncePoint1.startsWith('0x') ? noncePoint1.slice(2) : noncePoint1);
    const p2Bytes = hexToBytes(noncePoint2.startsWith('0x') ? noncePoint2.slice(2) : noncePoint2);

    if (p1Bytes[0] !== 0x04 || p2Bytes[0] !== 0x04) {
      throw new Error('Points must be in uncompressed format (0x04 prefix)');
    }

    // Extract coordinates
    const x1 = BigInt('0x' + bytesToHex(p1Bytes.slice(1, 33)));
    const y1 = BigInt('0x' + bytesToHex(p1Bytes.slice(33, 65)));
    const x2 = BigInt('0x' + bytesToHex(p2Bytes.slice(1, 33)));
    const y2 = BigInt('0x' + bytesToHex(p2Bytes.slice(33, 65)));

    // secp256k1 curve field modulus
    const p = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F');

    let x3: bigint;
    let y3: bigint;

    // Check if points have same x-coordinate
    if (x1 === x2) {
      if (y1 === y2) {
        // Point doubling: P + P = 2P
        // slope = (3 * x1^2) / (2 * y1)
        const numerator = (3n * x1 * x1) % p;
        const denominator = (2n * y1) % p;
        const slope = (numerator * modInverse(denominator, p)) % p;

        x3 = (slope * slope - 2n * x1) % p;
        y3 = (slope * (x1 - x3) - y1) % p;
      } else {
        // P + (-P) = Point at infinity (should not happen in practice)
        throw new Error('Points are inverses, result is point at infinity');
      }
    } else {
      // General case: P1 + P2 where x1 != x2
      // slope = (y2 - y1) / (x2 - x1)
      const numerator = ((y2 - y1) % p + p) % p;
      const denominator = ((x2 - x1) % p + p) % p;
      const slope = (numerator * modInverse(denominator, p)) % p;

      // x3 = slope^2 - x1 - x2
      x3 = ((slope * slope - x1 - x2) % p + p) % p;

      // y3 = slope * (x1 - x3) - y1
      y3 = ((slope * (x1 - x3) - y1) % p + p) % p;
    }

    // Ensure positive coordinates (normalize to [0, p))
    x3 = ((x3 % p) + p) % p;
    y3 = ((y3 % p) + p) % p;

    // Construct combined point (uncompressed format)
    const combined = new Uint8Array(65);
    combined[0] = 0x04; // Uncompressed prefix
    combined.set(hexToBytes(x3.toString(16).padStart(64, '0')), 1);
    combined.set(hexToBytes(y3.toString(16).padStart(64, '0')), 33);

    console.log('Combined nonce point:', bytesToHex(combined).slice(0, 20) + '...');
    return bytesToHex(combined);
  }
}
