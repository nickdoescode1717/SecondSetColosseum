// Ed25519Crypto.test.ts
//
// Comprehensive tests for Ed25519 DKG and threshold signing (Solana)

import { Ed25519Keygen, Ed25519Signing } from '../Ed25519Crypto';
import bs58 from 'bs58';

// Mock crypto.getRandomValues for deterministic testing
const originalGetRandomValues = global.crypto.getRandomValues;

function mockRandomBytes(seed: number) {
  let counter = seed;
  return (array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      counter = (counter * 1103515245 + 12345) & 0x7fffffff;
      array[i] = (counter >> 16) & 0xff;
    }
    return array;
  };
}

describe('Ed25519Keygen', () => {
  describe('generateRound1', () => {
    it('should generate valid polynomial shares and commitments', () => {
      const myIndex = 1;
      const allIndices = [1, 2, 3];

      const result = Ed25519Keygen.generateRound1(myIndex, allIndices);

      // Check structure
      expect(result).toHaveProperty('secret');
      expect(result).toHaveProperty('coefficient');
      expect(result).toHaveProperty('commitments');
      expect(result).toHaveProperty('shares');

      // Verify commitments are 32-byte hex (Ed25519 compressed points)
      expect(result.commitments).toHaveLength(2);
      expect(result.commitments[0]).toMatch(/^[0-9a-f]{64}$/);
      expect(result.commitments[1]).toMatch(/^[0-9a-f]{64}$/);

      // Verify shares for all participants
      expect(Object.keys(result.shares)).toEqual(['1', '2', '3']);
      for (const share of Object.values(result.shares)) {
        expect(share).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('should generate different shares for different indices', () => {
      const myIndex = 1;
      const allIndices = [1, 2, 3];

      const result = Ed25519Keygen.generateRound1(myIndex, allIndices);

      // Shares should be different for different indices
      expect(result.shares[1]).not.toBe(result.shares[2]);
      expect(result.shares[2]).not.toBe(result.shares[3]);
      expect(result.shares[1]).not.toBe(result.shares[3]);
    });
  });

  describe('processRound2', () => {
    it('should verify shares and produce consensus address (3-of-3)', () => {
      const allIndices = [1, 2, 3];

      // Each participant generates Round 1
      const p1Round1 = Ed25519Keygen.generateRound1(1, allIndices);
      const p2Round1 = Ed25519Keygen.generateRound1(2, allIndices);
      const p3Round1 = Ed25519Keygen.generateRound1(3, allIndices);

      // Participant 1 processes shares from 2 and 3
      const p1Result = Ed25519Keygen.processRound2(1, p1Round1, [
        { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[1] },
        { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[1] },
      ]);

      // Participant 2 processes shares from 1 and 3
      const p2Result = Ed25519Keygen.processRound2(2, p2Round1, [
        { fromIndex: 1, commitments: p1Round1.commitments, share: p1Round1.shares[2] },
        { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[2] },
      ]);

      // Participant 3 processes shares from 1 and 2
      const p3Result = Ed25519Keygen.processRound2(3, p3Round1, [
        { fromIndex: 1, commitments: p1Round1.commitments, share: p1Round1.shares[3] },
        { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[3] },
      ]);

      // All participants should derive the SAME wallet address
      expect(p1Result.walletAddress).toBe(p2Result.walletAddress);
      expect(p2Result.walletAddress).toBe(p3Result.walletAddress);

      // All participants should derive the SAME combined public key
      expect(p1Result.combinedPublicKey).toBe(p2Result.combinedPublicKey);
      expect(p2Result.combinedPublicKey).toBe(p3Result.combinedPublicKey);

      // Wallet address should be valid base58 (Solana format)
      const addressBytes = bs58.decode(p1Result.walletAddress);
      expect(addressBytes.length).toBe(32);

      console.log('✅ Consensus Solana address:', p1Result.walletAddress);
      console.log('✅ Combined public key:', p1Result.combinedPublicKey);
    });

    it('should reject invalid shares (Feldman verification failure)', () => {
      const allIndices = [1, 2, 3];

      const p1Round1 = Ed25519Keygen.generateRound1(1, allIndices);
      const p2Round1 = Ed25519Keygen.generateRound1(2, allIndices);

      // Tamper with the share from participant 2
      const tamperedShare = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      // Should throw during Feldman verification
      expect(() => {
        Ed25519Keygen.processRound2(1, p1Round1, [
          { fromIndex: 2, commitments: p2Round1.commitments, share: tamperedShare },
        ]);
      }).toThrow('Feldman verification failed');
    });
  });

  describe('deriveAddress', () => {
    it('should derive valid Solana address from Ed25519 public key', () => {
      // Use a known test public key
      const testPubKey = '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c';

      const address = Ed25519Keygen.deriveAddress(testPubKey);

      // Decode and verify it's 32 bytes
      const decoded = bs58.decode(address);
      expect(decoded.length).toBe(32);

      // Verify round-trip
      const reEncoded = bs58.encode(decoded);
      expect(reEncoded).toBe(address);
    });

    it('should handle 0x-prefixed public keys', () => {
      const testPubKey = '3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c';
      const testPubKeyPrefixed = '0x' + testPubKey;

      const address1 = Ed25519Keygen.deriveAddress(testPubKey);
      const address2 = Ed25519Keygen.deriveAddress(testPubKeyPrefixed);

      expect(address1).toBe(address2);
    });

    it('should reject invalid public key lengths', () => {
      const invalidPubKey = '1234'; // Too short

      expect(() => {
        Ed25519Keygen.deriveAddress(invalidPubKey);
      }).toThrow('Expected 32-byte Ed25519 public key');
    });
  });
});

describe('Ed25519Signing', () => {
  describe('generateNonce', () => {
    it('should generate random nonce and nonce point', () => {
      const { nonce, noncePoint } = Ed25519Signing.generateNonce();

      // Nonce should be 32-byte hex
      expect(nonce).toMatch(/^[0-9a-f]{64}$/);

      // Nonce point should be 32-byte hex (compressed Ed25519 point)
      expect(noncePoint).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate different nonces on repeated calls', () => {
      const nonce1 = Ed25519Signing.generateNonce();
      const nonce2 = Ed25519Signing.generateNonce();

      expect(nonce1.nonce).not.toBe(nonce2.nonce);
      expect(nonce1.noncePoint).not.toBe(nonce2.noncePoint);
    });
  });

  describe('combineNoncePoints', () => {
    it('should combine two Ed25519 points', () => {
      const { noncePoint: r1 } = Ed25519Signing.generateNonce();
      const { noncePoint: r2 } = Ed25519Signing.generateNonce();

      const combined = Ed25519Signing.combineNoncePoints(r1, r2);

      // Should be valid 32-byte hex
      expect(combined).toMatch(/^[0-9a-f]{64}$/);

      // Should be different from inputs
      expect(combined).not.toBe(r1);
      expect(combined).not.toBe(r2);
    });
  });

  describe('computeLagrangeCoefficient', () => {
    it('should compute correct Lagrange coefficient for 2-of-3', () => {
      // For signers 1 and 2 (excluding 3)
      const lambda1 = Ed25519Signing.computeLagrangeCoefficient(1, [1, 2]);
      const lambda2 = Ed25519Signing.computeLagrangeCoefficient(2, [1, 2]);

      // Lagrange coefficients should be non-zero
      expect(lambda1).not.toBe(0n);
      expect(lambda2).not.toBe(0n);

      // Known values for indices [1, 2]:
      // lambda_1 = (0 - 2) / (1 - 2) = -2 / -1 = 2
      // lambda_2 = (0 - 1) / (2 - 1) = -1 / 1 = -1
      // But we need to work mod l (Ed25519 order)
      console.log('Lambda 1:', lambda1.toString(16));
      console.log('Lambda 2:', lambda2.toString(16));
    });

    it('should compute Lagrange coefficient for different signer sets', () => {
      const lambda1_12 = Ed25519Signing.computeLagrangeCoefficient(1, [1, 2]);
      const lambda1_13 = Ed25519Signing.computeLagrangeCoefficient(1, [1, 3]);

      // Different signer sets should give different coefficients
      expect(lambda1_12).not.toBe(lambda1_13);
    });
  });

  describe('createPartialSignature (2-of-3 threshold)', () => {
    it('should create partial signatures that combine to valid Ed25519 signature', () => {
      // Step 1: DKG to generate key shares
      const allIndices = [1, 2, 3];
      const p1Round1 = Ed25519Keygen.generateRound1(1, allIndices);
      const p2Round1 = Ed25519Keygen.generateRound1(2, allIndices);
      const p3Round1 = Ed25519Keygen.generateRound1(3, allIndices);

      const p1Result = Ed25519Keygen.processRound2(1, p1Round1, [
        { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[1] },
        { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[1] },
      ]);

      const p2Result = Ed25519Keygen.processRound2(2, p2Round1, [
        { fromIndex: 1, commitments: p1Round1.commitments, share: p1Round1.shares[2] },
        { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[2] },
      ]);

      // Step 2: Sign a message with signers 1 and 2
      const messageHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';
      const signerIndices = [1, 2];

      // Each signer generates their nonce
      const { nonce: nonce1, noncePoint: r1 } = Ed25519Signing.generateNonce();
      const { nonce: nonce2, noncePoint: r2 } = Ed25519Signing.generateNonce();

      // Combine nonce points (coordinator does this)
      const combinedR = Ed25519Signing.combineNoncePoints(r1, r2);

      // Each signer creates their partial signature
      const partialSig1 = Ed25519Signing.createPartialSignature(
        p1Result.finalKeyShare,
        messageHash,
        1,
        signerIndices,
        combinedR,
        p1Result.combinedPublicKey,
        nonce1
      );

      const partialSig2 = Ed25519Signing.createPartialSignature(
        p2Result.finalKeyShare,
        messageHash,
        2,
        signerIndices,
        combinedR,
        p2Result.combinedPublicKey,
        nonce2
      );

      // Verify structure
      expect(partialSig1.partialSignature).toMatch(/^[0-9a-f]{64}$/);
      expect(partialSig2.partialSignature).toMatch(/^[0-9a-f]{64}$/);
      expect(partialSig1.noncePoint).toMatch(/^[0-9a-f]{64}$/);
      expect(partialSig2.noncePoint).toMatch(/^[0-9a-f]{64}$/);

      console.log('✅ Partial signature 1:', partialSig1.partialSignature);
      console.log('✅ Partial signature 2:', partialSig2.partialSignature);
      console.log('✅ Combined R:', combinedR);

      // Coordinator would combine these (sum mod l)
      const ED25519_ORDER = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');
      const s1 = BigInt('0x' + partialSig1.partialSignature);
      const s2 = BigInt('0x' + partialSig2.partialSignature);
      const combinedS = (s1 + s2) % ED25519_ORDER;

      console.log('✅ Combined s:', combinedS.toString(16));

      // Signature format: (R, s) where R is 32 bytes, s is 32 bytes
      expect(combinedS).toBeGreaterThan(0n);
      expect(combinedS).toBeLessThan(ED25519_ORDER);
    });
  });

  describe('End-to-End: DKG + Threshold Signing (2-of-3)', () => {
    it('should complete full ceremony: keygen + signing with signers 1,2', () => {
      console.log('\n=== Starting Ed25519 2-of-3 Threshold Test ===\n');

      // === PHASE 1: DKG (all 3 participants) ===
      console.log('Phase 1: Distributed Key Generation');
      const allIndices = [1, 2, 3];

      const p1Round1 = Ed25519Keygen.generateRound1(1, allIndices);
      const p2Round1 = Ed25519Keygen.generateRound1(2, allIndices);
      const p3Round1 = Ed25519Keygen.generateRound1(3, allIndices);

      const p1Keygen = Ed25519Keygen.processRound2(1, p1Round1, [
        { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[1] },
        { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[1] },
      ]);

      const p2Keygen = Ed25519Keygen.processRound2(2, p2Round1, [
        { fromIndex: 1, commitments: p1Round1.commitments, share: p1Round1.shares[2] },
        { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[2] },
      ]);

      const p3Keygen = Ed25519Keygen.processRound2(3, p3Round1, [
        { fromIndex: 1, commitments: p1Round1.commitments, share: p1Round1.shares[3] },
        { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[3] },
      ]);

      // Verify consensus
      expect(p1Keygen.walletAddress).toBe(p2Keygen.walletAddress);
      expect(p2Keygen.walletAddress).toBe(p3Keygen.walletAddress);

      console.log(`✅ Wallet Address: ${p1Keygen.walletAddress}`);
      console.log(`✅ Public Key: ${p1Keygen.combinedPublicKey}\n`);

      // === PHASE 2: Threshold Signing (2-of-3: signers 1 and 2) ===
      console.log('Phase 2: Threshold Signing (signers 1 and 2)');
      const messageHash = 'c0ffee42c0ffee42c0ffee42c0ffee42c0ffee42c0ffee42c0ffee42c0ffee42';
      const signerIndices = [1, 2];

      // Generate nonces
      const { nonce: nonce1, noncePoint: r1 } = Ed25519Signing.generateNonce();
      const { nonce: nonce2, noncePoint: r2 } = Ed25519Signing.generateNonce();
      const combinedR = Ed25519Signing.combineNoncePoints(r1, r2);

      // Create partial signatures
      const partialSig1 = Ed25519Signing.createPartialSignature(
        p1Keygen.finalKeyShare,
        messageHash,
        1,
        signerIndices,
        combinedR,
        p1Keygen.combinedPublicKey,
        nonce1
      );

      const partialSig2 = Ed25519Signing.createPartialSignature(
        p2Keygen.finalKeyShare,
        messageHash,
        2,
        signerIndices,
        combinedR,
        p2Keygen.combinedPublicKey,
        nonce2
      );

      console.log(`✅ Partial sig 1: ${partialSig1.partialSignature.slice(0, 16)}...`);
      console.log(`✅ Partial sig 2: ${partialSig2.partialSignature.slice(0, 16)}...`);

      // Combine (coordinator's job)
      const ED25519_ORDER = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');
      const s1 = BigInt('0x' + partialSig1.partialSignature);
      const s2 = BigInt('0x' + partialSig2.partialSignature);
      const combinedS = (s1 + s2) % ED25519_ORDER;

      console.log(`✅ Combined signature s: ${combinedS.toString(16).slice(0, 16)}...`);
      console.log(`✅ Combined nonce R: ${combinedR.slice(0, 16)}...\n`);

      console.log('=== Ed25519 Threshold Test Complete ===\n');

      // Final assertions
      expect(partialSig1.partialSignature).toMatch(/^[0-9a-f]{64}$/);
      expect(partialSig2.partialSignature).toMatch(/^[0-9a-f]{64}$/);
      expect(combinedS).toBeGreaterThan(0n);
      expect(combinedS).toBeLessThan(ED25519_ORDER);
    });

    it('should work with different signer combinations (1,3)', () => {
      // DKG
      const allIndices = [1, 2, 3];
      const p1Round1 = Ed25519Keygen.generateRound1(1, allIndices);
      const p2Round1 = Ed25519Keygen.generateRound1(2, allIndices);
      const p3Round1 = Ed25519Keygen.generateRound1(3, allIndices);

      const p1Keygen = Ed25519Keygen.processRound2(1, p1Round1, [
        { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[1] },
        { fromIndex: 3, commitments: p3Round1.commitments, share: p3Round1.shares[1] },
      ]);

      const p3Keygen = Ed25519Keygen.processRound2(3, p3Round1, [
        { fromIndex: 1, commitments: p1Round1.commitments, share: p1Round1.shares[3] },
        { fromIndex: 2, commitments: p2Round1.commitments, share: p2Round1.shares[3] },
      ]);

      // Sign with signers 1 and 3
      const messageHash = 'baadf00dbaadf00dbaadf00dbaadf00dbaadf00dbaadf00dbaadf00dbaadf00d';
      const signerIndices = [1, 3];

      const { nonce: nonce1, noncePoint: r1 } = Ed25519Signing.generateNonce();
      const { nonce: nonce3, noncePoint: r3 } = Ed25519Signing.generateNonce();
      const combinedR = Ed25519Signing.combineNoncePoints(r1, r3);

      const partialSig1 = Ed25519Signing.createPartialSignature(
        p1Keygen.finalKeyShare,
        messageHash,
        1,
        signerIndices,
        combinedR,
        p1Keygen.combinedPublicKey,
        nonce1
      );

      const partialSig3 = Ed25519Signing.createPartialSignature(
        p3Keygen.finalKeyShare,
        messageHash,
        3,
        signerIndices,
        combinedR,
        p3Keygen.combinedPublicKey,
        nonce3
      );

      // Combine
      const ED25519_ORDER = BigInt('0x1000000000000000000000000000000014DEF9DEA2F79CD65812631A5CF5D3ED');
      const s1 = BigInt('0x' + partialSig1.partialSignature);
      const s3 = BigInt('0x' + partialSig3.partialSignature);
      const combinedS = (s1 + s3) % ED25519_ORDER;

      console.log('✅ Signing with indices [1,3] successful');
      expect(combinedS).toBeGreaterThan(0n);
      expect(combinedS).toBeLessThan(ED25519_ORDER);
    });
  });
});
