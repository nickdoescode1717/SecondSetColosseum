import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { resolveVaultChain } from '@/lib/chains/utils';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { id },
      include: {
        vault: true,
        payee: true,
        creator: {
          select: { name: true, email: true },
        },
      },
    });

    if (!paymentRequest || paymentRequest.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    return NextResponse.json({ request: paymentRequest });
  } catch (error) {
    console.error('Error fetching request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    const body = await request.json();
    const { vaultId, payeeId, asset, amountMinor, memo } = body;

    // Find the request
    const existingRequest = await prisma.paymentRequest.findUnique({
      where: { id },
    });

    if (!existingRequest || existingRequest.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Only allow editing DRAFT requests
    if (existingRequest.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only draft requests can be edited' }, { status: 400 });
    }

    // Only the creator can edit their draft
    if (existingRequest.createdBy !== user.id) {
      return NextResponse.json({ error: 'Only the creator can edit this draft' }, { status: 403 });
    }

    // Check if vault exists and belongs to org
    const vault = await prisma.vault.findUnique({
      where: { id: vaultId },
    });

    if (!vault || vault.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    // Validate asset based on chain
    const chain = resolveVaultChain(vault.chain, vault.address);
    const validAssets = chain === 'SOLANA' ? ['SOL', 'USDC'] : ['ETH', 'USDC', 'USDT', 'EURC'];
    if (asset && !validAssets.includes(asset)) {
      return NextResponse.json({ error: `Invalid asset '${asset}' for ${chain} chain. Valid: ${validAssets.join(', ')}` }, { status: 400 });
    }

    // Check if payee exists, is approved, and belongs to org
    const payee = await prisma.payee.findUnique({
      where: { id: payeeId },
    });

    if (!payee || payee.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Payee not found' }, { status: 404 });
    }

    if (payee.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Payee is not approved' }, { status: 400 });
    }

    // Check if payee chain matches vault chain
    if (payee.chain !== vault.chain) {
      return NextResponse.json({ error: 'Payee chain does not match vault chain' }, { status: 400 });
    }

    // Update the request (stay in DRAFT status)
    const updatedRequest = await prisma.paymentRequest.update({
      where: { id },
      data: {
        vaultId,
        payeeId,
        chain: vault.chain,
        asset: asset || existingRequest.asset,
        amountMinor,
        memo: memo || null,
      },
      include: {
        vault: true,
        payee: true,
        creator: {
          select: { name: true, email: true },
        },
      },
    });

    return NextResponse.json({ request: updatedRequest });
  } catch (error) {
    console.error('Error updating request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const user = session.user as any;

  try {
    // Find the request
    const paymentRequest = await prisma.paymentRequest.findUnique({
      where: { id },
    });

    if (!paymentRequest || paymentRequest.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    // Only allow deletion of DRAFT requests
    if (paymentRequest.status !== 'DRAFT') {
      return NextResponse.json({ error: 'Only draft requests can be deleted' }, { status: 400 });
    }

    // Only the creator can delete their draft
    if (paymentRequest.createdBy !== user.id) {
      return NextResponse.json({ error: 'Only the creator can delete this draft' }, { status: 403 });
    }

    // Delete audit events first (foreign key constraint)
    await prisma.auditEvent.deleteMany({
      where: { requestId: id },
    });

    // Delete the request
    await prisma.paymentRequest.delete({
      where: { id },
    });

    return NextResponse.json({ success: true, message: 'Draft deleted successfully' });
  } catch (error) {
    console.error('Error deleting request:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
