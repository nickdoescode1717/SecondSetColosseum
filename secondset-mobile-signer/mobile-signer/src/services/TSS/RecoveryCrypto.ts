// mobile-signer/src/services/TSS/RecoveryCrypto.ts
//
// Resharing protocol for vault recovery.
// Supports secp256k1 (EVM) and Ed25519 (Solana) curves.
// Uses ECIES encryption (ECDH + XOR + HMAC) for sub-share transit so the
// coordinator never sees plaintext key material.
//
// Protocol overview:
//   t old shareholders each create a degree-(m-1) polynomial with their key
//   share as the constant term.  They evaluate that polynomial at the indices
//   of each new committee member, encrypt the resulting sub-shares to the
//   recipient's device public key, and broadcast Feldman commitments.
//   New committee members decrypt, verify via Feldman, apply Lagrange
//   interpolation over the old-signer contributions, and sum to obtain
//   their new key share.  At no point does any single party or the
//   coordinator learn the group secret.

import * as secp256k1 from '@noble/secp256k1';
import { ed25519 } from '@noble/curves/ed25519.js';
import { sha256 } from '@noble/hashes/sha256.js';
import { hmac } from '@noble/hashes/hmac.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import bs58 from 'bs58';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURVE_ORDER = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141',
);

const ED25519_ORDER = BigInt(
  '0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED',
);

// secp256k1 field prime (needed for address derivation)
const SECP256K1_P = BigInt(
  '0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F',
);

// ---------------------------------------------------------------------------
// Utility helpers (mirrored from TSSCrypto.ts / Ed25519Crypto.ts)
// ---------------------------------------------------------------------------

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

function randomFieldElement(): bigint {
  while (true) {
    const bytes = getRandomBytes(32);
    const num = BigInt('0x' + bytesToHex(bytes));
    if (num > 0n && num < CURVE_ORDER) {
      return num;
    }
  }
}

function randomScalar(): bigint {
  while (true) {
    const bytes = getRandomBytes(32);
    const num = BigInt('0x' + bytesToHex(bytes));
    if (num > 0n && num < ED25519_ORDER) {
      return num;
    }
  }
}

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

/** Modular exponentiation: base^exp mod m */
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

/** Convert a bigint to a zero-padded 32-byte hex string. */
function bigintToHex64(n: bigint): string {
  return n.toString(16).padStart(64, '0');
}

/** Parse a hex string (with optional 0x prefix) as bigint. */
function hexToBigint(hex: string): bigint {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  return BigInt('0x' + cleaned);
}

// ---------------------------------------------------------------------------
// ECIES encryption for sub-share transit
// ---------------------------------------------------------------------------
//
// We avoid AES entirely since crypto.subtle is not reliably available in
// React Native.  Instead we use:
//   - ECDH to derive a shared secret
//   - SHA-256(shared secret bytes) as a 32-byte key
//   - XOR encryption (sub-shares are always exactly 32 bytes)
//   - HMAC-SHA256 for authentication
//
// This is safe because:
//   1. Each ephemeral key is used exactly once (one-time pad).
//   2. HMAC provides ciphertext authentication.
//   3. Sub-shares are exactly 32 bytes (field elements), matching the key
//      length, so XOR produces a one-time pad with full entropy.
// ---------------------------------------------------------------------------

export interface EncryptedSubShare {
  /** Sender's ephemeral public key (hex). */
  ephemeral_pub: string;
  /** XOR-encrypted sub-share (hex, 32 bytes). */
  ciphertext: string;
  /** HMAC-SHA256 authentication tag (hex). */
  mac: string;
}

// -- secp256k1 ECIES -------------------------------------------------------

function eciesEncryptSecp256k1(
  plaintext: Uint8Array,
  recipientPubKeyHex: string,
): EncryptedSubShare {
  // Generate ephemeral keypair
  const ephPriv = randomFieldElement();
  const ephPrivBytes = hexToBytes(bigintToHex64(ephPriv));
  const ephPubBytes = secp256k1.getPublicKey(ephPrivBytes, true); // compressed

  // ECDH shared secret: ephPriv * recipientPub
  const recipientPubBytes = hexToBytes(
    recipientPubKeyHex.startsWith('0x')
      ? recipientPubKeyHex.slice(2)
      : recipientPubKeyHex,
  );
  const sharedSecretRaw = secp256k1.getSharedSecret(ephPrivBytes, recipientPubBytes, true);
  // sharedSecretRaw is a compressed point (33 bytes); derive key from it
  const key = sha256(sharedSecretRaw);

  // XOR encrypt
  if (plaintext.length !== 32) {
    throw new Error(
      `ECIES secp256k1: plaintext must be 32 bytes, got ${plaintext.length}`,
    );
  }
  const ct = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    ct[i] = plaintext[i] ^ key[i];
  }

  const mac = bytesToHex(hmac(sha256, key, ct));

  return {
    ephemeral_pub: bytesToHex(ephPubBytes),
    ciphertext: bytesToHex(ct),
    mac,
  };
}

function eciesDecryptSecp256k1(
  encrypted: EncryptedSubShare,
  recipientPrivKeyHex: string,
): Uint8Array {
  const recipientPrivBytes = hexToBytes(
    recipientPrivKeyHex.startsWith('0x')
      ? recipientPrivKeyHex.slice(2)
      : recipientPrivKeyHex,
  );
  const ephPubBytes = hexToBytes(encrypted.ephemeral_pub);

  // ECDH shared secret
  const sharedSecretRaw = secp256k1.getSharedSecret(recipientPrivBytes, ephPubBytes, true);
  const key = sha256(sharedSecretRaw);

  // Verify MAC
  const ct = hexToBytes(encrypted.ciphertext);
  const expectedMac = bytesToHex(hmac(sha256, key, ct));
  if (expectedMac !== encrypted.mac) {
    throw new Error('ECIES secp256k1: MAC verification failed');
  }

  // XOR decrypt
  const pt = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    pt[i] = ct[i] ^ key[i];
  }
  return pt;
}

// -- Ed25519 point validation ------------------------------------------------

/**
 * Validate that an Ed25519 point has the correct large prime order.
 * Ed25519 has cofactor 8, so we must reject small-order torsion points
 * that would reduce the ECDH shared secret to a tiny set of values.
 */
function validateEd25519PublicKey(point: typeof ed25519.Point.BASE): void {
  // Reject the identity point
  if (point.equals(ed25519.Point.ZERO)) {
    throw new Error('ECIES Ed25519: rejected identity point');
  }
  // Multiply by the group order — should yield identity for a valid prime-order point
  const check = point.multiply(ED25519_ORDER);
  if (!check.equals(ed25519.Point.ZERO)) {
    throw new Error('ECIES Ed25519: rejected small-order or mixed-order point');
  }
}

// -- Ed25519 ECIES ----------------------------------------------------------

function eciesEncryptEd25519(
  plaintext: Uint8Array,
  recipientPubKeyHex: string,
): EncryptedSubShare {
  // Generate ephemeral scalar and point
  const ephScalar = randomScalar();
  const ephPoint = ed25519.Point.BASE.multiply(ephScalar);
  const ephPubHex = bytesToHex(ephPoint.toBytes());

  // ECDH: ephScalar * recipientPub
  const recipientPub = ed25519.Point.fromHex(
    recipientPubKeyHex.startsWith('0x')
      ? recipientPubKeyHex.slice(2)
      : recipientPubKeyHex,
  );
  // Validate recipient public key is not a small-order torsion point (cofactor 8)
  validateEd25519PublicKey(recipientPub);
  const sharedPoint = recipientPub.multiply(ephScalar);
  const sharedSecretBytes = sharedPoint.toBytes(); // 32 bytes
  const key = sha256(sharedSecretBytes);

  if (plaintext.length !== 32) {
    throw new Error(
      `ECIES Ed25519: plaintext must be 32 bytes, got ${plaintext.length}`,
    );
  }
  const ct = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    ct[i] = plaintext[i] ^ key[i];
  }

  const mac = bytesToHex(hmac(sha256, key, ct));

  return {
    ephemeral_pub: ephPubHex,
    ciphertext: bytesToHex(ct),
    mac,
  };
}

function eciesDecryptEd25519(
  encrypted: EncryptedSubShare,
  recipientPrivScalarHex: string,
): Uint8Array {
  const recipientScalar = hexToBigint(recipientPrivScalarHex);
  const ephPoint = ed25519.Point.fromHex(encrypted.ephemeral_pub);
  // Validate ephemeral point is not a small-order torsion point (cofactor 8)
  validateEd25519PublicKey(ephPoint);

  // ECDH: recipientScalar * ephPoint
  const sharedPoint = ephPoint.multiply(recipientScalar);
  const sharedSecretBytes = sharedPoint.toBytes();
  const key = sha256(sharedSecretBytes);

  // Verify MAC
  const ct = hexToBytes(encrypted.ciphertext);
  const expectedMac = bytesToHex(hmac(sha256, key, ct));
  if (expectedMac !== encrypted.mac) {
    throw new Error('ECIES Ed25519: MAC verification failed');
  }

  const pt = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    pt[i] = ct[i] ^ key[i];
  }
  return pt;
}

// ---------------------------------------------------------------------------
// Device keypair generation
// ---------------------------------------------------------------------------

/**
 * Generate an ephemeral keypair for ECIES.  Each device generates this when
 * joining a resharing ceremony and shares the public key with the
 * coordinator.  The private key stays on-device for decrypting sub-shares.
 */
export function generateDeviceKeyPair(curveType: 'secp256k1' | 'ed25519'): {
  privateKey: string; // hex
  publicKey: string; // hex (compressed for secp256k1, 32-byte for Ed25519)
} {
  if (curveType === 'secp256k1') {
    const priv = randomFieldElement();
    const privBytes = hexToBytes(bigintToHex64(priv));
    const pubBytes = secp256k1.getPublicKey(privBytes, true);
    return {
      privateKey: bigintToHex64(priv),
      publicKey: bytesToHex(pubBytes),
    };
  } else {
    const priv = randomScalar();
    const pubPoint = ed25519.Point.BASE.multiply(priv);
    return {
      privateKey: bigintToHex64(priv),
      publicKey: bytesToHex(pubPoint.toBytes()),
    };
  }
}

// ---------------------------------------------------------------------------
// Polynomial evaluation helper
// ---------------------------------------------------------------------------

/**
 * Evaluate a polynomial at x modulo the given order.
 * coefficients[0] is the constant term, coefficients[1] the linear term, etc.
 */
function polyEval(coefficients: bigint[], x: bigint, order: bigint): bigint {
  let result = 0n;
  let xPow = 1n; // x^0 = 1
  for (const coeff of coefficients) {
    result = (result + coeff * xPow) % order;
    xPow = (xPow * x) % order;
  }
  return ((result % order) + order) % order;
}

// ---------------------------------------------------------------------------
// Lagrange coefficients
// ---------------------------------------------------------------------------

/**
 * Compute Lagrange coefficient lambda_i for evaluation at x = 0.
 *
 *   lambda_i = product_{j != i} (0 - x_j) / (x_i - x_j)  mod order
 */
function lagrangeCoefficient(
  signerIndex: number,
  allIndices: number[],
  order: bigint,
): bigint {
  const xi = BigInt(signerIndex);
  let lambda = 1n;

  for (const j of allIndices) {
    if (j === signerIndex) continue;
    const xj = BigInt(j);
    // numerator: (0 - xj) mod order
    const num = (order - xj) % order;
    // denominator: (xi - xj) mod order
    const den = ((xi - xj) % order + order) % order;
    lambda = (lambda * num) % order;
    lambda = (lambda * modInverse(den, order)) % order;
  }

  return lambda;
}

// ---------------------------------------------------------------------------
// Address derivation helpers (copied from TSSCrypto / Ed25519Crypto)
// ---------------------------------------------------------------------------

function deriveEvmAddress(compressedPubKeyHex: string): string {
  const cleanPubKey = compressedPubKeyHex.startsWith('0x')
    ? compressedPubKeyHex.slice(2)
    : compressedPubKeyHex;

  const prefix = parseInt(cleanPubKey.slice(0, 2), 16);
  const xHex = cleanPubKey.slice(2);
  const x = BigInt('0x' + xHex);

  const xCubed = (x * x * x) % SECP256K1_P;
  const ySquared = (xCubed + 7n) % SECP256K1_P;
  const y = modPow(ySquared, (SECP256K1_P + 1n) / 4n, SECP256K1_P);

  const yFinal = (prefix === 2) === (y % 2n === 0n) ? y : SECP256K1_P - y;

  const xBytes = hexToBytes(xHex);
  const yBytes = hexToBytes(yFinal.toString(16).padStart(64, '0'));
  const uncompressed = new Uint8Array(64);
  uncompressed.set(xBytes, 0);
  uncompressed.set(yBytes, 32);

  const hash = keccak_256(uncompressed);
  const addressBytes = hash.slice(-20);
  return '0x' + bytesToHex(addressBytes);
}

function deriveSolanaAddress(pubKeyHex: string): string {
  const cleanHex = pubKeyHex.startsWith('0x') ? pubKeyHex.slice(2) : pubKeyHex;
  const pubKeyBytes = hexToBytes(cleanHex);
  if (pubKeyBytes.length !== 32) {
    throw new Error(
      `Expected 32-byte Ed25519 public key, got ${pubKeyBytes.length} bytes`,
    );
  }
  return bs58.encode(pubKeyBytes);
}

// ---------------------------------------------------------------------------
// secp256k1 resharing
// ---------------------------------------------------------------------------

/**
 * Old signer's side of the resharing protocol for secp256k1 (EVM) vaults.
 *
 * An old shareholder with key share f(i) constructs a degree-(m-1)
 * polynomial g(x) with g(0) = f(i), evaluates it at each new signer's
 * index, encrypts each sub-share to the recipient's device public key,
 * and publishes Feldman commitments.
 */
export class OldSignerReshareSecp256k1 {
  /**
   * Round 1: Generate sub-share polynomial, Feldman commitments, and
   * encrypted sub-shares for each new committee member.
   *
   * @param oldKeyShare      hex string of the old f(i)
   * @param oldSignerIndex   original signer index (1, 2, or 3)
   * @param newSignerIndices indices assigned to new committee members, e.g. [1, 2, 3]
   * @param newThreshold     m in the new m-of-n threshold (polynomial degree = m - 1)
   * @param newSignerPubKeys map from new signer index to their ECIES device public key (hex, compressed secp256k1)
   *
   * @returns commitments (Feldman) and encrypted sub-shares keyed by new signer index
   */
  static generateRound1(
    oldKeyShare: string,
    oldSignerIndex: number,
    newSignerIndices: number[],
    newThreshold: number,
    newSignerPubKeys: Record<number, string>,
  ): {
    commitments: string[];
    encryptedSubShares: Record<number, EncryptedSubShare>;
  } {
    console.log(
      `[Reshare secp256k1] Old signer ${oldSignerIndex} generating round 1 ` +
        `(newThreshold=${newThreshold}, newSigners=${newSignerIndices})`,
    );

    const keyShareBig = hexToBigint(oldKeyShare);

    // Build polynomial coefficients: g(x) = keyShare + a_1*x + ... + a_{m-1}*x^{m-1}
    const coefficients: bigint[] = [keyShareBig];
    for (let d = 1; d < newThreshold; d++) {
      coefficients.push(randomFieldElement());
    }

    // Feldman commitments: C_k = coefficients[k] * G  (compressed)
    const commitments: string[] = coefficients.map(c => {
      const cBytes = hexToBytes(bigintToHex64(c));
      return bytesToHex(secp256k1.getPublicKey(cBytes, true));
    });

    // Evaluate g(j) for each new signer j and encrypt to their device key
    const encryptedSubShares: Record<number, EncryptedSubShare> = {};
    for (const j of newSignerIndices) {
      const subShare = polyEval(coefficients, BigInt(j), CURVE_ORDER);
      const subShareBytes = hexToBytes(bigintToHex64(subShare));

      const recipientPub = newSignerPubKeys[j];
      if (!recipientPub) {
        throw new Error(
          `[Reshare secp256k1] Missing device public key for new signer ${j}`,
        );
      }

      encryptedSubShares[j] = eciesEncryptSecp256k1(subShareBytes, recipientPub);
    }

    console.log(
      `[Reshare secp256k1] Old signer ${oldSignerIndex} generated ` +
        `${commitments.length} commitments and ` +
        `${Object.keys(encryptedSubShares).length} encrypted sub-shares`,
    );

    return { commitments, encryptedSubShares };
  }
}

/**
 * New signer's side of the resharing protocol for secp256k1 (EVM) vaults.
 *
 * A new committee member receives encrypted sub-shares from t old signers,
 * decrypts them, verifies against Feldman commitments, applies Lagrange
 * interpolation across old-signer contributions, and computes their new
 * key share and the combined public key.
 */
export class NewSignerReshareSecp256k1 {
  /**
   * Process all received sub-shares and derive the new key share.
   *
   * @param newSignerIndex   this signer's index in the new committee (e.g. 1, 2, or 3)
   * @param myPrivateKey     hex, ECIES device private key for decryption
   * @param oldSignerData    one entry per old signer who participated
   *
   * @returns newKeyShare (hex), combinedPublicKey (compressed hex), walletAddress (0x-prefixed)
   */
  static processSubShares(
    newSignerIndex: number,
    myPrivateKey: string,
    oldSignerData: Array<{
      oldSignerIndex: number;
      commitments: string[];
      encryptedSubShare: EncryptedSubShare;
    }>,
  ): {
    newKeyShare: string;
    combinedPublicKey: string;
    walletAddress: string;
  } {
    console.log(
      `[Reshare secp256k1] New signer ${newSignerIndex} processing ` +
        `${oldSignerData.length} sub-shares`,
    );

    if (oldSignerData.length === 0) {
      throw new Error('[Reshare secp256k1] No sub-shares to process');
    }

    // Collect old signer indices for Lagrange computation
    const oldIndices = oldSignerData.map(d => d.oldSignerIndex);

    // 1. Decrypt and verify each sub-share
    const decryptedSubShares: Array<{
      oldSignerIndex: number;
      subShare: bigint;
      commitments: string[];
    }> = [];

    for (const data of oldSignerData) {
      // Decrypt
      const subShareBytes = eciesDecryptSecp256k1(
        data.encryptedSubShare,
        myPrivateKey,
      );
      const subShare = BigInt('0x' + bytesToHex(subShareBytes));

      // Feldman verification: g_i(j) * G == C0 + j*C1 + j^2*C2 + ...
      const subShareScalarBytes = hexToBytes(bigintToHex64(subShare));
      const subSharePoint = secp256k1.Point.fromHex(
        bytesToHex(secp256k1.getPublicKey(subShareScalarBytes, true)),
      );

      const j = BigInt(newSignerIndex);
      let expectedPoint = secp256k1.Point.fromHex(data.commitments[0]);
      let jPow = j; // j^1
      for (let k = 1; k < data.commitments.length; k++) {
        const Ck = secp256k1.Point.fromHex(data.commitments[k]);
        expectedPoint = expectedPoint.add(Ck.multiply(jPow));
        jPow = (jPow * j) % CURVE_ORDER;
      }

      if (!subSharePoint.equals(expectedPoint)) {
        throw new Error(
          `[Reshare secp256k1] Feldman verification failed for old signer ${data.oldSignerIndex}`,
        );
      }

      console.log(
        `[Reshare secp256k1] Sub-share from old signer ${data.oldSignerIndex} verified`,
      );

      decryptedSubShares.push({
        oldSignerIndex: data.oldSignerIndex,
        subShare,
        commitments: data.commitments,
      });
    }

    // 2. Compute Lagrange coefficients for old signer indices at x = 0
    //    lambda_i = product_{k!=i} (0 - x_k) / (x_i - x_k) mod n
    const lambdas: Record<number, bigint> = {};
    for (const idx of oldIndices) {
      lambdas[idx] = lagrangeCoefficient(idx, oldIndices, CURVE_ORDER);
    }

    // 3. Compute new key share: f'(j) = sum_i( lambda_i * g_i(j) ) mod n
    let newKeyShare = 0n;
    for (const { oldSignerIndex, subShare } of decryptedSubShares) {
      const lambda = lambdas[oldSignerIndex];
      newKeyShare = (newKeyShare + lambda * subShare) % CURVE_ORDER;
    }
    newKeyShare = ((newKeyShare % CURVE_ORDER) + CURVE_ORDER) % CURVE_ORDER;

    // 4. Compute combined public key: sum_i( lambda_i * C_i0 )
    //    C_i0 is the first Feldman commitment from old signer i, which
    //    equals g_i(0) * G = oldKeyShare_i * G.
    //    sum( lambda_i * oldKeyShare_i * G ) = groupSecret * G  (by Lagrange)
    let combinedPubKeyPoint: InstanceType<typeof secp256k1.Point> | null = null;
    for (const { oldSignerIndex, commitments } of decryptedSubShares) {
      const lambda = lambdas[oldSignerIndex];
      const C0 = secp256k1.Point.fromHex(commitments[0]);
      const weighted = C0.multiply(lambda);
      combinedPubKeyPoint =
        combinedPubKeyPoint === null
          ? weighted
          : combinedPubKeyPoint.add(weighted);
    }

    if (!combinedPubKeyPoint) {
      throw new Error('[Reshare secp256k1] Failed to compute combined public key');
    }

    const combinedPublicKey = combinedPubKeyPoint.toHex(true);
    const walletAddress = deriveEvmAddress(combinedPublicKey);

    console.log(
      `[Reshare secp256k1] New signer ${newSignerIndex} computed key share and ` +
        `wallet address ${walletAddress}`,
    );

    return {
      newKeyShare: bigintToHex64(newKeyShare),
      combinedPublicKey,
      walletAddress,
    };
  }
}

// ---------------------------------------------------------------------------
// Ed25519 resharing
// ---------------------------------------------------------------------------

/**
 * Old signer's side of the resharing protocol for Ed25519 (Solana) vaults.
 *
 * Identical structure to the secp256k1 variant but uses the Ed25519 curve
 * for scalar arithmetic, point multiplication, and ECIES.
 */
export class OldSignerReshareEd25519 {
  /**
   * Round 1: Generate sub-share polynomial, Feldman commitments, and
   * encrypted sub-shares for each new committee member.
   *
   * @param oldKeyShare      hex string of the old key share
   * @param oldSignerIndex   original signer index (1, 2, or 3)
   * @param newSignerIndices indices assigned to new committee members
   * @param newThreshold     m in the new m-of-n threshold
   * @param newSignerPubKeys map from new signer index to their ECIES device public key (hex, 32-byte Ed25519 point)
   */
  static generateRound1(
    oldKeyShare: string,
    oldSignerIndex: number,
    newSignerIndices: number[],
    newThreshold: number,
    newSignerPubKeys: Record<number, string>,
  ): {
    commitments: string[];
    encryptedSubShares: Record<number, EncryptedSubShare>;
  } {
    console.log(
      `[Reshare Ed25519] Old signer ${oldSignerIndex} generating round 1 ` +
        `(newThreshold=${newThreshold}, newSigners=${newSignerIndices})`,
    );

    const keyShareBig = hexToBigint(oldKeyShare);

    // Build polynomial: g(x) = keyShare + a_1*x + ... + a_{m-1}*x^{m-1}
    const coefficients: bigint[] = [keyShareBig];
    for (let d = 1; d < newThreshold; d++) {
      coefficients.push(randomScalar());
    }

    // Feldman commitments: C_k = coefficients[k] * G  (Ed25519 compressed, 32 bytes)
    const commitments: string[] = coefficients.map(c => {
      const point = ed25519.Point.BASE.multiply(c);
      return bytesToHex(point.toBytes());
    });

    // Evaluate g(j) for each new signer j and encrypt
    const encryptedSubShares: Record<number, EncryptedSubShare> = {};
    for (const j of newSignerIndices) {
      const subShare = polyEval(coefficients, BigInt(j), ED25519_ORDER);
      const subShareBytes = hexToBytes(bigintToHex64(subShare));

      const recipientPub = newSignerPubKeys[j];
      if (!recipientPub) {
        throw new Error(
          `[Reshare Ed25519] Missing device public key for new signer ${j}`,
        );
      }

      encryptedSubShares[j] = eciesEncryptEd25519(subShareBytes, recipientPub);
    }

    console.log(
      `[Reshare Ed25519] Old signer ${oldSignerIndex} generated ` +
        `${commitments.length} commitments and ` +
        `${Object.keys(encryptedSubShares).length} encrypted sub-shares`,
    );

    return { commitments, encryptedSubShares };
  }
}

/**
 * New signer's side of the resharing protocol for Ed25519 (Solana) vaults.
 */
export class NewSignerReshareEd25519 {
  /**
   * Process all received sub-shares and derive the new key share.
   *
   * @param newSignerIndex  this signer's index in the new committee
   * @param myPrivateKey    hex, ECIES device private scalar for decryption
   * @param oldSignerData   one entry per old signer who participated
   *
   * @returns newKeyShare (hex), combinedPublicKey (hex, 32 bytes), walletAddress (base58)
   */
  static processSubShares(
    newSignerIndex: number,
    myPrivateKey: string,
    oldSignerData: Array<{
      oldSignerIndex: number;
      commitments: string[];
      encryptedSubShare: EncryptedSubShare;
    }>,
  ): {
    newKeyShare: string;
    combinedPublicKey: string;
    walletAddress: string;
  } {
    console.log(
      `[Reshare Ed25519] New signer ${newSignerIndex} processing ` +
        `${oldSignerData.length} sub-shares`,
    );

    if (oldSignerData.length === 0) {
      throw new Error('[Reshare Ed25519] No sub-shares to process');
    }

    const oldIndices = oldSignerData.map(d => d.oldSignerIndex);

    // 1. Decrypt and verify each sub-share
    const decryptedSubShares: Array<{
      oldSignerIndex: number;
      subShare: bigint;
      commitments: string[];
    }> = [];

    for (const data of oldSignerData) {
      // Decrypt
      const subShareBytes = eciesDecryptEd25519(
        data.encryptedSubShare,
        myPrivateKey,
      );
      const subShare = BigInt('0x' + bytesToHex(subShareBytes));

      // Feldman verification: g_i(j) * G == C0 + j*C1 + j^2*C2 + ...
      const subSharePoint = ed25519.Point.BASE.multiply(subShare);

      const j = BigInt(newSignerIndex);
      let expectedPoint = ed25519.Point.fromHex(data.commitments[0]);
      let jPow = j; // j^1
      for (let k = 1; k < data.commitments.length; k++) {
        const Ck = ed25519.Point.fromHex(data.commitments[k]);
        expectedPoint = expectedPoint.add(Ck.multiply(jPow));
        jPow = (jPow * j) % ED25519_ORDER;
      }

      if (!subSharePoint.equals(expectedPoint)) {
        throw new Error(
          `[Reshare Ed25519] Feldman verification failed for old signer ${data.oldSignerIndex}`,
        );
      }

      console.log(
        `[Reshare Ed25519] Sub-share from old signer ${data.oldSignerIndex} verified`,
      );

      decryptedSubShares.push({
        oldSignerIndex: data.oldSignerIndex,
        subShare,
        commitments: data.commitments,
      });
    }

    // 2. Compute Lagrange coefficients for old signer indices at x = 0
    const lambdas: Record<number, bigint> = {};
    for (const idx of oldIndices) {
      lambdas[idx] = lagrangeCoefficient(idx, oldIndices, ED25519_ORDER);
    }

    // 3. Compute new key share: f'(j) = sum_i( lambda_i * g_i(j) ) mod l
    let newKeyShare = 0n;
    for (const { oldSignerIndex, subShare } of decryptedSubShares) {
      const lambda = lambdas[oldSignerIndex];
      newKeyShare = (newKeyShare + lambda * subShare) % ED25519_ORDER;
    }
    newKeyShare = ((newKeyShare % ED25519_ORDER) + ED25519_ORDER) % ED25519_ORDER;

    // 4. Compute combined public key: sum_i( lambda_i * C_i0 )
    let combinedPubKeyPoint: InstanceType<typeof ed25519.Point> | null = null;
    for (const { oldSignerIndex, commitments } of decryptedSubShares) {
      const lambda = lambdas[oldSignerIndex];
      const C0 = ed25519.Point.fromHex(commitments[0]);
      const weighted = C0.multiply(lambda);
      combinedPubKeyPoint =
        combinedPubKeyPoint === null
          ? weighted
          : combinedPubKeyPoint.add(weighted);
    }

    if (!combinedPubKeyPoint) {
      throw new Error('[Reshare Ed25519] Failed to compute combined public key');
    }

    const combinedPublicKey = bytesToHex(combinedPubKeyPoint.toBytes());
    const walletAddress = deriveSolanaAddress(combinedPublicKey);

    console.log(
      `[Reshare Ed25519] New signer ${newSignerIndex} computed key share and ` +
        `wallet address ${walletAddress}`,
    );

    return {
      newKeyShare: bigintToHex64(newKeyShare),
      combinedPublicKey,
      walletAddress,
    };
  }
}
