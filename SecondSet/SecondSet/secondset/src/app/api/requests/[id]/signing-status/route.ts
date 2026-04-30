import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { createPublicClient, http, serializeTransaction, keccak256, recoverAddress } from 'viem';
import { mainnet, base, sepolia, baseSepolia } from 'viem/chains';
import { getExplorerUrl, SupportedChain } from '@/lib/chains/evm/builder';
import { getSolanaExplorerUrl } from '@/lib/chains/solana/builder';
import { resolveVaultChain } from '@/lib/chains/utils';
import { Connection, Transaction, PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import { createAuditEvent } from '@/lib/audit';

const CURVE_ORDER = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141');
const HALF_CURVE_ORDER = CURVE_ORDER / 2n;

const CHAIN_CONFIG = {
  ethereum: { chain: mainnet, rpcUrl: process.env.ETHEREUM_RPC_URL! },
  sepolia: { chain: sepolia, rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.ETHEREUM_RPC_URL! },
  base: { chain: base, rpcUrl: process.env.BASE_RPC_URL! },
  'base-sepolia': { chain: baseSepolia, rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_RPC_URL! },
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRoles(['SIGNER', 'ADMIN']);
    const { id: requestId } = await params;

    const request = await prisma.paymentRequest.findUnique({
      where: { id: requestId },
      include: {
        signingSession: true,
        vault: true,
      },
    });

    if (!request || request.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const session = request.signingSession;
    if (!session) {
      return NextResponse.json({ error: 'No signing session found' }, { status: 400 });
    }

    // If already broadcasted, return existing data
    if (session.status === 'COMPLETED' && request.txHash) {
      return NextResponse.json({
        status: 'COMPLETED',
        txHash: request.txHash,
        explorerUrl: request.explorerUrl,
      });
    }

    // If completed, broadcast transaction
    if (session.status === 'COMPLETED' && session.signedTx && !request.txHash) {
      // Atomically claim the broadcast slot to prevent concurrent polls
      // from double-broadcasting. Only one request will match txHash: null.
      const claimed = await prisma.paymentRequest.updateMany({
        where: { id: requestId, txHash: null },
        data: { status: 'READY_TO_RELEASE' }, // keep current status as a lock
      });

      if (claimed.count === 0) {
        // Another poll already claimed the broadcast — re-fetch and return
        const latest = await prisma.paymentRequest.findUnique({
          where: { id: requestId },
        });
        return NextResponse.json({
          status: 'COMPLETED',
          txHash: latest?.txHash,
          explorerUrl: latest?.explorerUrl,
        });
      }

      console.log('📡 Broadcasting signed transaction:', requestId);

      const resolvedChain = resolveVaultChain(request.chain, request.vault.address);
      let txHash: string;
      let explorerUrl: string;

      if (resolvedChain === 'EVM') {
        // ===== EVM BROADCAST =====
        const chainName = request.vault.chainName as SupportedChain;
        const config = CHAIN_CONFIG[chainName];

        if (!config) {
          throw new Error(`Unsupported chain: ${chainName}`);
        }

        const publicClient = createPublicClient({
          chain: config.chain,
          transport: http(config.rpcUrl),
        });

        const signature = typeof session.signedTx === 'string'
          ? JSON.parse(session.signedTx)
          : session.signedTx;

        const unsignedTx = typeof request.unsignedTx === 'string'
          ? JSON.parse(request.unsignedTx as string)
          : request.unsignedTx as any;

        const r = signature.r as `0x${string}`;
        let s = BigInt(signature.s as string);

        // EIP-2: Low-s normalization — s must be in lower half of curve order
        if (s > HALF_CURVE_ORDER) {
          console.log('🔧 Normalizing s to low-s form (EIP-2)');
          s = CURVE_ORDER - s;
        }
        const sHex = ('0x' + s.toString(16).padStart(64, '0')) as `0x${string}`;

        const txFields = {
          to: unsignedTx.to as `0x${string}`,
          value: BigInt(unsignedTx.value || '0'),
          data: unsignedTx.data as `0x${string}`,
          nonce: Number(unsignedTx.nonce),
          gas: BigInt(unsignedTx.gasLimit),
          maxFeePerGas: BigInt(unsignedTx.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(unsignedTx.maxPriorityFeePerGas),
          chainId: Number(unsignedTx.chainId),
          type: 'eip1559' as const,
        };

        const vaultAddress = request.vault.address.toLowerCase();
        let serializedTx: `0x${string}` | null = null;

        const signingHash = keccak256(serializeTransaction(txFields));
        console.log('Signing hash:', signingHash);
        console.log('Vault address:', vaultAddress);
        console.log('r:', r, 's:', sHex);

        for (const yParity of [0, 1] as const) {
          try {
            const recovered = await recoverAddress({
              hash: signingHash,
              signature: { r, s: sHex, yParity },
            });
            console.log(`yParity=${yParity} → recovered: ${recovered}`);
            if (recovered.toLowerCase() === vaultAddress) {
              serializedTx = serializeTransaction(txFields, { r, s: sHex, yParity });
              console.log(`✅ yParity=${yParity} matches vault address`);
              break;
            }
          } catch (e) {
            console.log(`yParity=${yParity} recovery failed:`, e);
          }
        }

        if (!serializedTx) {
          throw new Error(
            `Signature does not recover to vault address ${request.vault.address}. ` +
            `TSS signature may be invalid.`
          );
        }

        console.log('📡 Serialized signed tx:', serializedTx.slice(0, 40) + '...');

        try {
          txHash = await publicClient.sendRawTransaction({
            serializedTransaction: serializedTx,
          });
          explorerUrl = getExplorerUrl(chainName, txHash);
        } catch (broadcastError: any) {
          if (broadcastError.details?.includes('nonce too low') ||
              broadcastError.shortMessage?.includes('nonce too low')) {
            console.log('⚠️ Nonce too low — transaction was already broadcast.');
            txHash = keccak256(serializedTx);
            explorerUrl = getExplorerUrl(chainName, txHash);
          } else {
            throw broadcastError;
          }
        }
      } else {
        // ===== SOLANA BROADCAST =====
        const signature = typeof session.signedTx === 'string'
          ? JSON.parse(session.signedTx)
          : session.signedTx;

        const unsignedTx = typeof request.unsignedTx === 'string'
          ? JSON.parse(request.unsignedTx as string)
          : request.unsignedTx as any;

        // Ed25519 signature: R (32-byte point) + s (32-byte scalar) = 64 bytes
        // R is already in Ed25519 compressed format (little-endian y with x sign bit) from @noble/curves
        // s is transmitted as big-endian hex but Ed25519 signatures require little-endian s
        const rHex = (signature.R || signature.r) as string;
        const sHex = (signature.s) as string;
        const rBytes = Buffer.from(rHex.replace('0x', ''), 'hex');
        const sBytesBE = Buffer.from(sHex.replace('0x', ''), 'hex');

        console.log(`Solana Ed25519 sig components — R: ${rBytes.length} bytes, s: ${sBytesBE.length} bytes`);

        if (rBytes.length !== 32 || sBytesBE.length !== 32) {
          throw new Error(
            `Invalid Ed25519 signature size: R=${rBytes.length}B (expected 32), s=${sBytesBE.length}B (expected 32). ` +
            `Raw R hex length=${rHex.replace('0x', '').length}, s hex length=${sHex.replace('0x', '').length}`
          );
        }

        // Convert s from big-endian to little-endian (Ed25519 convention per RFC 8032)
        const sBytes = Buffer.from(sBytesBE).reverse();
        const ed25519Sig = Buffer.concat([rBytes, sBytes]); // 64 bytes

        // Reconstruct the signed transaction: [numSignatures, signature, serializedMessage]
        const messageBytes = Buffer.from(unsignedTx.serializedMessage, 'hex');
        const pubKeyBytes = new PublicKey(request.vault.address).toBytes();

        // Diagnostic: compare txDigest (what mobile signed) vs serializedMessage (what we broadcast)
        const txDigestHex = request.txDigest?.replace('0x', '') || '';
        const serializedMsgHex = unsignedTx.serializedMessage;
        console.log(`Solana tx assembly — sig: ${ed25519Sig.length}B, message: ${messageBytes.length}B`);
        console.log(`  txDigest matches serializedMessage: ${txDigestHex === serializedMsgHex}`);
        console.log(`  R (first 20 hex): ${rHex.slice(0, 40)}`);
        console.log(`  s BE (first 20 hex): ${sHex.slice(0, 40)}`);
        console.log(`  s LE (first 20 hex): ${sBytes.toString('hex').slice(0, 40)}`);
        console.log(`  pubKey: ${request.vault.address}`);
        console.log(`  message (first 20 hex): ${serializedMsgHex.slice(0, 40)}`);

        // Manual Ed25519 verification before broadcasting
        const sigLE = new Uint8Array(Buffer.concat([rBytes, sBytes]));
        const manualVerify = ed25519.verify(sigLE, messageBytes, pubKeyBytes);
        console.log(`  Manual Ed25519 verify (s as LE): ${manualVerify}`);

        // Also try WITHOUT reversing s (in case coordinator already sends LE)
        const sigBE = new Uint8Array(Buffer.concat([rBytes, sBytesBE]));
        const verifyNoReverse = ed25519.verify(sigBE, messageBytes, pubKeyBytes);
        console.log(`  Manual Ed25519 verify (s as BE / no reverse): ${verifyNoReverse}`);

        // Use whichever signature passes verification
        let finalSig: Buffer;
        if (manualVerify) {
          finalSig = Buffer.concat([rBytes, sBytes]);
        } else if (verifyNoReverse) {
          console.log('  ⚠️ Signature valid WITHOUT s reversal — coordinator sends LE s');
          finalSig = Buffer.concat([rBytes, sBytesBE]);
        } else {
          console.log('  ❌ Neither s encoding verifies — crypto bug in TSS signing');
          throw new Error(
            `Ed25519 signature verification failed locally. ` +
            `Neither LE nor BE s encoding produces a valid signature for pubkey ${request.vault.address}.`
          );
        }

        const solanaTx = Transaction.from(
          Buffer.concat([
            Buffer.from([1]), // 1 signature (fee payer)
            finalSig,         // 64-byte Ed25519 signature
            messageBytes,     // serialized message
          ])
        );

        const network = unsignedTx.network || 'solana-devnet';
        const rpcUrl = network === 'solana-mainnet'
          ? (process.env.SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com')
          : (process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com');

        const connection = new Connection(rpcUrl, 'confirmed');

        console.log('📡 Broadcasting Solana transaction...');

        txHash = await connection.sendRawTransaction(solanaTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        explorerUrl = getSolanaExplorerUrl(network, txHash);
      }

      console.log('✅ Transaction broadcasted:', txHash);

      await prisma.paymentRequest.update({
        where: { id: requestId },
        data: {
          status: 'BROADCASTED',
          releasedBy: user.id,
          releasedAt: new Date(),
          broadcastedAt: new Date(),
          txHash,
          explorerUrl,
        },
      });

      // Audit events
      await createAuditEvent({
        orgId: user.orgId,
        userId: user.id,
        eventType: 'REQUEST_RELEASED',
        requestId: request.id,
        metadata: {
          txHash,
          explorerUrl,
        },
      });

      await createAuditEvent({
        orgId: user.orgId,
        userId: user.id,
        eventType: 'REQUEST_BROADCASTED',
        requestId: request.id,
        metadata: {
          txHash,
          explorerUrl,
          chain: request.chain,
        },
      });

      return NextResponse.json({
        status: 'COMPLETED',
        txHash,
        explorerUrl,
      });
    }

    // Return current status
    return NextResponse.json({
      status: session.status,
      error: session.errorMessage,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error('❌ Error checking signing status:', error);
    return NextResponse.json(
      { error: error.message || 'Internal error' },
      { status: 500 }
    );
  }
}
