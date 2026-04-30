import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyWebhookSignature } from '@/lib/webhooks';
import { createAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    // Get headers
    const signature = req.headers.get('X-Coordinator-Signature');
    const timestamp = req.headers.get('X-Coordinator-Timestamp');

    if (!signature || !timestamp) {
      console.error('❌ Webhook missing signature or timestamp');
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    // Get raw body
    const rawBody = await req.text();
    const secret = process.env.COORDINATOR_WEBHOOK_SECRET!;

    if (!secret) {
      console.error('❌ COORDINATOR_WEBHOOK_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Verify signature
    const isValid = verifyWebhookSignature({
      payload: rawBody,
      signature,
      timestamp,
      secret,
    });

    if (!isValid) {
      console.error('❌ Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse payload
    const payload = JSON.parse(rawBody);
    const { type, sessionId } = payload;

    console.log('📥 Received webhook:', { type, sessionId });

    // Route to handler
    switch (type) {
      case 'keygen.completed':
        await handleKeygenCompleted(payload);
        break;
      case 'keygen.failed':
        await handleKeygenFailed(payload);
        break;
      case 'signing.completed':
        await handleSigningCompleted(payload);
        break;
      case 'signing.failed':
        await handleSigningFailed(payload);
        break;
      case 'recovery.completed':
        await handleRecoveryCompleted(payload);
        break;
      case 'recovery.failed':
        await handleRecoveryFailed(payload);
        break;
      default:
        console.warn(`Unknown webhook type: ${type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleKeygenCompleted(payload: any) {
  const { sessionId, walletAddress } = payload;

  console.log('🔑 Handling keygen.completed:', { sessionId, walletAddress });

  // Find session by coordinator ID
  const session = await prisma.keygenSession.findUnique({
    where: { coordinatorSessionId: sessionId },
  });

  if (!session) {
    console.error(`❌ Keygen session not found: ${sessionId}`);
    return;
  }

  // Idempotency check
  if (session.status === 'COMPLETED') {
    console.log(`✅ Keygen session already completed: ${sessionId}`);
    return;
  }

  // Normalize address: lowercase for EVM (hex), preserve case for Solana (base58)
  const normalizedAddress = session.chain === 'SOLANA'
    ? walletAddress
    : walletAddress.toLowerCase();

  // Create vault
  const vault = await prisma.vault.create({
    data: {
      orgId: session.orgId,
      chain: session.chain,
      chainName: session.chainName!,
      address: normalizedAddress,
      name: `${session.chainName} Vault`,
      turnkeyWalletId: sessionId, // Store coordinator session ID
    },
  });

  console.log('✅ Vault created:', vault.id);

  // Update session
  await prisma.keygenSession.update({
    where: { id: session.id },
    data: {
      status: 'COMPLETED',
      walletAddress: normalizedAddress,
      vaultId: vault.id,
      completedAt: new Date(),
    },
  });

  // Audit
  await createAuditEvent({
    orgId: session.orgId,
    userId: session.initiatedBy,
    eventType: 'KEYGEN_COMPLETED',
    metadata: {
      sessionId: session.id,
      vaultId: vault.id,
      walletAddress: vault.address,
    },
  });

  await createAuditEvent({
    orgId: session.orgId,
    userId: session.initiatedBy,
    eventType: 'VAULT_CREATED',
    metadata: {
      vaultId: vault.id,
      chain: vault.chain,
      chainName: vault.chainName,
      address: vault.address,
    },
  });

  console.log('✅ Keygen completed successfully');
}

async function handleKeygenFailed(payload: any) {
  const { sessionId, error } = payload;

  console.log('❌ Handling keygen.failed:', { sessionId, error });

  const session = await prisma.keygenSession.findUnique({
    where: { coordinatorSessionId: sessionId },
  });

  if (!session) {
    console.error(`❌ Keygen session not found: ${sessionId}`);
    return;
  }

  await prisma.keygenSession.update({
    where: { id: session.id },
    data: {
      status: 'FAILED',
      errorMessage: error || 'Unknown error',
      completedAt: new Date(),
    },
  });

  await createAuditEvent({
    orgId: session.orgId,
    userId: session.initiatedBy,
    eventType: 'KEYGEN_FAILED',
    metadata: {
      sessionId: session.id,
      error,
    },
  });

  console.log('✅ Keygen failure recorded');
}

async function handleSigningCompleted(payload: any) {
  const { sessionId, signedTransaction } = payload;

  console.log('✍️  Handling signing.completed:', { sessionId });

  const session = await prisma.signingSession.findUnique({
    where: { coordinatorSessionId: sessionId },
    include: { paymentRequest: true },
  });

  if (!session) {
    console.error(`❌ Signing session not found: ${sessionId}`);
    return;
  }

  // Idempotency check
  if (session.status === 'COMPLETED') {
    console.log(`✅ Signing session already completed: ${sessionId}`);
    return;
  }

  // Update session
  await prisma.signingSession.update({
    where: { id: session.id },
    data: {
      status: 'COMPLETED',
      signedTx: signedTransaction,
      completedAt: new Date(),
    },
  });

  await createAuditEvent({
    orgId: session.orgId,
    userId: session.initiatedBy,
    eventType: 'SIGNING_COMPLETED',
    requestId: session.requestId,
    metadata: {
      sessionId: session.id,
    },
  });

  console.log('✅ Signing completed successfully');
  // Broadcasting will happen in signing-status endpoint polling
}

async function handleSigningFailed(payload: any) {
  const { sessionId, error } = payload;

  console.log('❌ Handling signing.failed:', { sessionId, error });

  const session = await prisma.signingSession.findUnique({
    where: { coordinatorSessionId: sessionId },
  });

  if (!session) {
    console.error(`❌ Signing session not found: ${sessionId}`);
    return;
  }

  await prisma.signingSession.update({
    where: { id: session.id },
    data: {
      status: 'FAILED',
      errorMessage: error || 'Unknown error',
      completedAt: new Date(),
    },
  });

  await createAuditEvent({
    orgId: session.orgId,
    userId: session.initiatedBy,
    eventType: 'SIGNING_FAILED',
    requestId: session.requestId,
    metadata: {
      sessionId: session.id,
      error,
    },
  });

  console.log('Signing failure recorded');
}

async function handleRecoveryCompleted(payload: any) {
  const { sessionId, walletAddress, newThreshold, newN, recoveryRecord } = payload;

  console.log('Handling recovery.completed:', { sessionId, walletAddress });

  const session = await prisma.recoverySession.findUnique({
    where: { coordinatorSessionId: sessionId },
    include: { vault: true },
  });

  if (!session) {
    console.error(`Recovery session not found: ${sessionId}`);
    return;
  }

  // Idempotency check
  if (session.status === 'COMPLETED') {
    console.log(`Recovery session already completed: ${sessionId}`);
    return;
  }

  // Update recovery session
  await prisma.recoverySession.update({
    where: { id: session.id },
    data: {
      status: 'COMPLETED',
      computedM: newThreshold,
      computedNewN: newN,
      recoveryRecord: recoveryRecord || undefined,
      completedAt: new Date(),
    },
  });

  // If the vault doesn't exist in this org (cross-org recovery), create it
  if (!session.vault) {
    // Normalize address: lowercase for EVM, preserve for Solana
    const normalizedAddress = session.chain === 'SOLANA'
      ? walletAddress
      : walletAddress.toLowerCase();

    // Check if vault already exists in this org
    const existingVault = await prisma.vault.findFirst({
      where: { orgId: session.orgId, address: normalizedAddress },
    });

    if (!existingVault) {
      // Look up the original vault by wallet address (any org) to get the correct chainName
      const sourceVault = await prisma.vault.findFirst({
        where: { address: normalizedAddress },
      });
      // Use the source vault's chainName, or derive a sensible default
      const chainName = sourceVault?.chainName
        || (session.chain === 'SOLANA'
          ? (process.env.SOLANA_MAINNET_RPC_URL ? 'solana-mainnet' : 'solana-devnet')
          : (process.env.ETHEREUM_RPC_URL ? 'ethereum' : 'sepolia'));

      await prisma.vault.create({
        data: {
          orgId: session.orgId,
          chain: session.chain,
          chainName,
          address: normalizedAddress,
          name: `Recovered Vault`,
          turnkeyWalletId: sessionId,
        },
      });
    }
  }

  await createAuditEvent({
    orgId: session.orgId,
    userId: session.initiatedBy,
    eventType: 'RECOVERY_COMPLETED',
    metadata: {
      recoverySessionId: session.id,
      walletAddress,
      newThreshold,
      newN,
    },
  });

  console.log('Recovery completed successfully');
}

async function handleRecoveryFailed(payload: any) {
  const { sessionId, error } = payload;

  console.log('Handling recovery.failed:', { sessionId, error });

  const session = await prisma.recoverySession.findUnique({
    where: { coordinatorSessionId: sessionId },
  });

  if (!session) {
    console.error(`Recovery session not found: ${sessionId}`);
    return;
  }

  // Idempotency check — don't overwrite terminal states
  if (['COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'].includes(session.status)) {
    console.log(`Recovery session already in terminal state (${session.status}): ${sessionId}`);
    return;
  }

  await prisma.recoverySession.update({
    where: { id: session.id },
    data: {
      status: 'FAILED',
      errorMessage: error || 'Unknown error',
      completedAt: new Date(),
    },
  });

  await createAuditEvent({
    orgId: session.orgId,
    userId: session.initiatedBy,
    eventType: 'RECOVERY_FAILED',
    metadata: {
      recoverySessionId: session.id,
      error,
    },
  });

  console.log('Recovery failure recorded');
}
