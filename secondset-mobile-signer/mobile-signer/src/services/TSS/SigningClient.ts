// mobile-signer/src/services/TSS/SigningClient.ts

import { coordinatorWS } from '../CoordinatorWS';
import { SecureStorage } from '../SecureStorage';
import { TSSSigning } from './TSSCrypto';
import { Ed25519Signing } from './Ed25519Crypto';
import { CurveType } from './CryptoFactory';
import bs58 from 'bs58';

interface SigningParticipant {
  participant_id: string;
  index: number;
  role: string;
}

export class SigningClient {
  private participantId: string = '';
  private sessionId: string = '';
  private signerIndex: number = 0;
  private participants: SigningParticipant[] = [];
  private txDigest: string = '';
  private keyShare: string = '';
  private walletAddress: string = '';
  private curveType: CurveType = 'secp256k1';

  // Round data
  private myNonce: string = '';
  private myNoncePoint: string = '';
  private otherNonce: string = '';
  private otherNoncePoint: string = '';
  private combinedNoncePoint: string = '';

  async initialize(
    participantId: string,
    sessionId: string,
    signerIndex: number,
    options?: {
      walletAddress?: string;
      curveType?: CurveType;
    }
  ) {
    this.participantId = participantId;
    this.sessionId = sessionId;
    this.signerIndex = signerIndex;
    this.walletAddress = options?.walletAddress || '';
    this.curveType = options?.curveType || 'secp256k1';

    console.log('Signing client initialized:', {
      participantId: participantId.slice(0, 8) + '...',
      sessionId: sessionId.slice(0, 8) + '...',
      signerIndex,
      curveType: this.curveType,
    });
  }

  async runCeremony(): Promise<{ signature: any }> {
    return new Promise((resolve, reject) => {
      // Listen for signing_start
      const handleSigningStart = async (message: any) => {
        console.log('Signing ceremony started - handler called');
        this.participants = message.participants;
        this.txDigest = message.tx_digest;

        // Use curve_type from message if available (coordinator is authoritative)
        if (message.curve_type) {
          this.curveType = message.curve_type as CurveType;
        }

        try {
          await this.startSigning();
        } catch (error) {
          console.error('Signing error:', error);
          reject(error);
        }
      };

      coordinatorWS.on('signing_start', handleSigningStart);

      // Listen for sign_round (receive other participant's nonce)
      const handleSignRound = (message: any) => {
        if (message.round === 1 && message.from_participant !== this.participantId) {
          try {
            const payload = JSON.parse(message.payload);
            this.otherNoncePoint = payload.noncePoint;
            // For secp256k1 (ECDSA), nonce scalar is shared
            // For ed25519 (EdDSA), only nonce point is shared
            if (payload.nonce) {
              this.otherNonce = payload.nonce;
              console.log('Received nonce point and scalar from other signer');
            } else {
              console.log('Received nonce point from other signer (EdDSA mode)');
            }
          } catch (error) {
            console.error('Error parsing sign_round payload:', error);
          }
        }
      };

      coordinatorWS.on('sign_round', handleSignRound);

      // Listen for signing_success
      const handleSigningSuccess = (message: any) => {
        console.log('Signing ceremony completed successfully!');

        // Cleanup listeners
        coordinatorWS.off('signing_start', handleSigningStart);
        coordinatorWS.off('sign_round', handleSignRound);
        coordinatorWS.off('signing_success', handleSigningSuccess);
        coordinatorWS.off('signing_failed', handleSigningFailed);

        resolve({
          signature: message.signature,
        });
      };

      coordinatorWS.on('signing_success', handleSigningSuccess);

      // Listen for signing_failed
      const handleSigningFailed = (message: any) => {
        console.error('Signing ceremony failed:', message.reason);

        // Cleanup listeners
        coordinatorWS.off('signing_start', handleSigningStart);
        coordinatorWS.off('sign_round', handleSignRound);
        coordinatorWS.off('signing_success', handleSigningSuccess);
        coordinatorWS.off('signing_failed', handleSigningFailed);

        reject(new Error(message.details || 'Signing failed'));
      };

      coordinatorWS.on('signing_failed', handleSigningFailed);
    });
  }

  private async startSigning() {
    console.log('Starting signing protocol with', this.participants.length, 'participants');
    console.log('My signer index:', this.signerIndex);
    console.log('Transaction digest:', this.txDigest);
    console.log('Curve type:', this.curveType);

    try {
      // Get key share from secure storage (vault-aware lookup)
      let keyShareData;
      if (this.walletAddress) {
        keyShareData = await SecureStorage.getVaultKeyShareByAddress(this.walletAddress);
      } else {
        // Fallback to legacy lookup
        keyShareData = await SecureStorage.getKeyShare();
      }

      if (!keyShareData) {
        throw new Error('Key share not found in secure storage');
      }
      this.keyShare = keyShareData.share;
      console.log('Retrieved key share from secure storage');

      if (this.curveType === 'ed25519') {
        await this.signEd25519();
      } else {
        await this.signSecp256k1();
      }
    } catch (error) {
      console.error('Error in startSigning:', error);
      throw error;
    }
  }

  /**
   * ECDSA signing flow (secp256k1) — existing flow
   * Both signers share nonce scalars so they can compute combined k^(-1)
   */
  private async signSecp256k1() {
    // Round 1: Generate nonce and nonce point
    console.log('ECDSA Signing Round 1/3: Generating nonce...');

    const nonceResult = TSSSigning.generateNonce();
    this.myNonce = nonceResult.nonce;
    this.myNoncePoint = nonceResult.noncePoint;

    console.log('Generated nonce point:', this.myNoncePoint.slice(0, 20) + '...');

    // Broadcast nonce point AND nonce scalar to other participants
    // (Sharing nonce scalar is needed so both signers can compute combined k^(-1))
    coordinatorWS.send({
      type: 'sign_round',
      from_participant: this.participantId,
      to_participant: '*',
      round: 1,
      payload: JSON.stringify({
        noncePoint: this.myNoncePoint,
        nonce: this.myNonce,
      }),
      timestamp: new Date().toISOString(),
    });

    await this.sleep(1000);

    // Round 2: Wait for other nonce point and combine
    console.log('ECDSA Signing Round 2/3: Waiting for other nonce point...');
    await this.waitForOtherNonce(true); // requireScalar=true for ECDSA

    this.combinedNoncePoint = TSSSigning.combineNoncePoints(
      this.myNoncePoint,
      this.otherNoncePoint
    );
    console.log('Combined nonce point:', this.combinedNoncePoint.slice(0, 20) + '...');

    await this.sleep(500);

    // Round 3: Create partial signature using COMBINED nonce k = k_1 + k_2
    console.log('ECDSA Signing Round 3/3: Creating partial signature...');
    const combinedNonce = TSSSigning.combineNonceScalars(this.myNonce, this.otherNonce);
    console.log('Combined nonce scalar computed');

    const sigResult = await TSSSigning.createPartialSignature(
      this.keyShare,
      this.txDigest,
      this.signerIndex as 1 | 2 | 3,
      this.combinedNoncePoint,
      combinedNonce
    );

    console.log('Generated partial signature:', sigResult.partialSignature.slice(0, 16) + '...');

    await this.sleep(500);

    // Report completion to coordinator
    console.log('Reporting completion to coordinator...');
    coordinatorWS.send({
      type: 'sign_complete',
      participant_id: this.participantId,
      partial_signature: sigResult.partialSignature,
      nonce_point: this.myNoncePoint,
    });
  }

  /**
   * EdDSA signing flow (Ed25519) — new flow for Solana
   * Each signer keeps their nonce scalar private; only nonce POINTS are shared
   */
  private async signEd25519() {
    // Round 1: Generate nonce and nonce point
    console.log('EdDSA Signing Round 1/3: Generating nonce...');

    const nonceResult = Ed25519Signing.generateNonce();
    this.myNonce = nonceResult.nonce;
    this.myNoncePoint = nonceResult.noncePoint;

    console.log('Generated nonce point:', this.myNoncePoint.slice(0, 20) + '...');

    // Broadcast nonce POINT ONLY (not scalar — more secure for EdDSA)
    coordinatorWS.send({
      type: 'sign_round',
      from_participant: this.participantId,
      to_participant: '*',
      round: 1,
      payload: JSON.stringify({
        noncePoint: this.myNoncePoint,
        // Note: NO nonce scalar for EdDSA
      }),
      timestamp: new Date().toISOString(),
    });

    await this.sleep(1000);

    // Round 2: Wait for other nonce point
    console.log('EdDSA Signing Round 2/3: Waiting for other nonce point...');
    await this.waitForOtherNonce(false); // requireScalar=false for EdDSA

    // Combine nonce points: R = R_1 + R_2
    this.combinedNoncePoint = Ed25519Signing.combineNoncePoints(
      this.myNoncePoint,
      this.otherNoncePoint
    );
    console.log('Combined nonce point R:', this.combinedNoncePoint.slice(0, 20) + '...');

    await this.sleep(500);

    // Round 3: Create partial Ed25519 signature
    // s_i = k_i + e * (lambda_i * x_i) mod l
    console.log('EdDSA Signing Round 3/3: Creating partial Ed25519 signature...');

    // Recover combined public key from wallet address
    // For Solana, address = base58(32-byte Ed25519 public key)
    const combinedPublicKeyHex = this.recoverEd25519PublicKey();

    // Collect signer indices for Lagrange coefficient calculation
    const signerIndices = this.participants.map(p => p.index);

    console.log('[Ed25519 Diag] SigningClient inputs:');
    console.log('  walletAddress:', this.walletAddress);
    console.log('  combinedPubKeyHex:', combinedPublicKeyHex.slice(0, 40));
    console.log('  combinedNoncePoint:', this.combinedNoncePoint.slice(0, 40));
    console.log('  myNoncePoint:', this.myNoncePoint.slice(0, 40));
    console.log('  otherNoncePoint:', this.otherNoncePoint.slice(0, 40));
    console.log('  txDigest (%d chars):', this.txDigest.length, this.txDigest.slice(0, 40));
    console.log('  signerIndices:', signerIndices);
    console.log('  mySignerIndex:', this.signerIndex);

    const sigResult = Ed25519Signing.createPartialSignature(
      this.keyShare,
      this.txDigest,
      this.signerIndex,
      signerIndices,
      this.combinedNoncePoint,
      combinedPublicKeyHex,
      this.myNonce, // Own nonce scalar (NOT combined)
    );

    console.log('Generated EdDSA partial signature:', sigResult.partialSignature.slice(0, 16) + '...');

    await this.sleep(500);

    // Report completion to coordinator
    console.log('Reporting completion to coordinator...');
    coordinatorWS.send({
      type: 'sign_complete',
      participant_id: this.participantId,
      partial_signature: sigResult.partialSignature,
      nonce_point: sigResult.noncePoint,
    });
  }

  /**
   * Recover Ed25519 combined public key from Solana wallet address.
   * Solana address = base58(32-byte Ed25519 public key), so decode reverses it.
   */
  private recoverEd25519PublicKey(): string {
    const pubKeyBytes = bs58.decode(this.walletAddress);
    return Array.from(pubKeyBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async waitForOtherNonce(requireScalar: boolean): Promise<void> {
    const maxWait = 10000; // 10 seconds
    const startTime = Date.now();

    while (!this.otherNoncePoint || (requireScalar && !this.otherNonce)) {
      if (Date.now() - startTime > maxWait) {
        throw new Error('Timeout waiting for other participant nonce');
      }
      await this.sleep(100);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cleanup() {
    coordinatorWS.removeAllListeners('signing_start');
    coordinatorWS.removeAllListeners('sign_round');
    coordinatorWS.removeAllListeners('signing_success');
    coordinatorWS.removeAllListeners('signing_failed');
  }
}
