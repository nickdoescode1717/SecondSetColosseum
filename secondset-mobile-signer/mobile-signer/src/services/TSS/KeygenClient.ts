// mobile-signer/src/services/TSS/KeygenClient.ts

import { coordinatorWS } from '../CoordinatorWS';
import { SecureStorage } from '../SecureStorage';
import { TSSKeygen } from './TSSCrypto';
import { Ed25519Keygen } from './Ed25519Crypto';
import { getKeygen, CurveType } from './CryptoFactory';

interface KeygenParticipant {
  participant_id: string;
  index: number;
  role: string;
}

export class KeygenClient {
  private participantId: string = '';
  private sessionId: string = '';
  private signerIndex: number = 0;
  private participants: KeygenParticipant[] = [];
  private keyShare: string = '';
  private combinedPublicKey: string = '';
  private curveType: CurveType = 'secp256k1';
  private chain: string = 'EVM';
  private vaultId: string = '';
  private orgId: string = '';

  async initialize(
    participantId: string,
    sessionId: string,
    signerIndex: number,
    options?: {
      curveType?: CurveType;
      chain?: string;
      vaultId?: string;
      orgId?: string;
    }
  ) {
    this.participantId = participantId;
    this.sessionId = sessionId;
    this.signerIndex = signerIndex;
    this.curveType = options?.curveType || 'secp256k1';
    this.chain = options?.chain || 'EVM';
    this.vaultId = options?.vaultId || '';
    this.orgId = options?.orgId || '';

    console.log('KeygenClient initialized:', {
      participantId: participantId.slice(0, 8) + '...',
      sessionId: sessionId.slice(0, 8) + '...',
      signerIndex,
      curveType: this.curveType,
      chain: this.chain,
    });
  }

  async runCeremony(): Promise<{ walletAddress: string; publicKey: string }> {
    return new Promise((resolve, reject) => {
      // Listen for keygen_start
      const handleKeygenStart = (message: any) => {
        console.log('Keygen ceremony started');
        this.participants = message.participants;

        // Use curve_type from message if available (coordinator is authoritative)
        if (message.curve_type) {
          this.curveType = message.curve_type as CurveType;
        }

        this.startDKG().catch(error => {
          console.error('DKG error:', error);
          reject(error);
        });
      };

      coordinatorWS.on('keygen_start', handleKeygenStart);

      // Listen for keygen_success
      const handleKeygenSuccess = async (message: any) => {
        console.log('Keygen ceremony completed successfully!');

        const role = this.participants.find(p => p.index === this.signerIndex)?.role || 'unknown';

        // Save to multi-vault secure storage
        await SecureStorage.storeVaultKeyShare({
          vault_id: this.vaultId || `auto_${message.wallet_address}`,
          share: this.keyShare,
          participant_id: this.participantId,
          org_id: this.orgId,
          role,
          wallet_address: message.wallet_address,
          chain: this.chain as 'EVM' | 'SOLANA',
          curve_type: this.curveType,
          signer_index: this.signerIndex,
          created_at: new Date().toISOString(),
        });

        console.log('Key share saved to secure storage (vault format)');

        resolve({
          walletAddress: message.wallet_address,
          publicKey: message.public_key,
        });
      };

      coordinatorWS.on('keygen_success', handleKeygenSuccess);

      // Listen for keygen_failed
      const handleKeygenFailed = (message: any) => {
        console.error('Keygen ceremony failed:', message.reason);
        reject(new Error(message.details || 'Ceremony failed'));
      };

      coordinatorWS.on('keygen_failed', handleKeygenFailed);
    });
  }

  private async startDKG() {
    const myIndex = this.signerIndex;
    const allIndices = this.participants.map(p => p.index);
    const otherParticipants = this.participants.filter(p => p.index !== myIndex);

    console.log('Starting DKG protocol with', this.participants.length, 'participants');
    console.log('Curve type:', this.curveType);

    // Select the correct keygen implementation based on curve type
    const Keygen = getKeygen(this.curveType);

    // Build participant_id -> index lookup
    const idToIndex = new Map<string, number>();
    for (const p of this.participants) {
      idToIndex.set(p.participant_id, p.index);
    }

    // Register round message listener BEFORE generating round 1 data
    const received = new Map<number, { commitments?: [string, string]; share?: string }>();

    const roundDataPromise = new Promise<void>((resolve) => {
      const handler = (message: any) => {
        if (message.round !== 1) return;

        try {
          const payload = JSON.parse(message.payload);
          const fromIndex = payload.fromIndex as number;

          if (fromIndex === myIndex) return;

          if (!received.has(fromIndex)) {
            received.set(fromIndex, {});
          }
          const entry = received.get(fromIndex)!;

          if (payload.commitments) {
            entry.commitments = payload.commitments;
          }
          if (payload.share) {
            entry.share = payload.share;
          }

          const complete = otherParticipants.every(p => {
            const d = received.get(p.index);
            return d?.commitments && d?.share;
          });

          if (complete) {
            coordinatorWS.off('keygen_round', handler);
            resolve();
          }
        } catch (err) {
          console.error('Error processing round message:', err);
        }
      };

      coordinatorWS.on('keygen_round', handler);
    });

    // Round 1: Generate polynomial, commitments, and shares
    console.log('DKG Round 1: Generating polynomial and shares...');
    const round1 = Keygen.generateRound1(myIndex, allIndices);

    // Broadcast commitments
    coordinatorWS.send({
      type: 'keygen_round',
      from_participant: this.participantId,
      to_participant: '*',
      round: 1,
      payload: JSON.stringify({
        commitments: round1.commitments,
        fromIndex: myIndex,
      }),
      timestamp: new Date().toISOString(),
    });

    // Send private shares to each other participant
    for (const p of otherParticipants) {
      coordinatorWS.send({
        type: 'keygen_round',
        from_participant: this.participantId,
        to_participant: p.participant_id,
        round: 1,
        payload: JSON.stringify({
          share: round1.shares[p.index],
          fromIndex: myIndex,
        }),
        timestamp: new Date().toISOString(),
      });
    }

    // Wait for all other participants' round 1 data
    console.log('Waiting for round 1 data from other participants...');
    await roundDataPromise;
    console.log('Received all round 1 data');

    // Round 2: Verify shares and compute final key share
    console.log('DKG Round 2: Verifying shares and computing final key share...');
    const receivedData = otherParticipants.map(p => ({
      fromIndex: p.index,
      commitments: received.get(p.index)!.commitments!,
      share: received.get(p.index)!.share!,
    }));

    const result = Keygen.processRound2(
      myIndex,
      {
        secret: round1.secret,
        coefficient: round1.coefficient,
        commitments: round1.commitments,
      },
      receivedData
    );

    this.keyShare = result.finalKeyShare;
    this.combinedPublicKey = result.combinedPublicKey;

    console.log('Final key share computed');
    console.log('Wallet address:', result.walletAddress);

    // Report completion to coordinator
    coordinatorWS.send({
      type: 'keygen_complete',
      participant_id: this.participantId,
      wallet_address: result.walletAddress,
      public_key_share: result.combinedPublicKey,
    });
  }

  cleanup() {
    coordinatorWS.removeAllListeners('keygen_start');
    coordinatorWS.removeAllListeners('keygen_success');
    coordinatorWS.removeAllListeners('keygen_failed');
    coordinatorWS.removeAllListeners('keygen_round');
  }
}
