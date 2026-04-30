import { NextRequest, NextResponse } from 'next/server';
import { requireRoles } from '@/lib/rbac';
import { prisma } from '@/lib/db';
import { createAuditEvent } from '@/lib/audit';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRoles(['ADMIN']);
    const { id } = await params;

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ error: 'Name must be 100 characters or less' }, { status: 400 });
    }

    // Find vault and verify org ownership
    const vault = await prisma.vault.findUnique({
      where: { id },
    });

    if (!vault || vault.orgId !== user.orgId) {
      return NextResponse.json({ error: 'Vault not found' }, { status: 404 });
    }

    const oldName = vault.name;

    // Update vault name
    const updated = await prisma.vault.update({
      where: { id },
      data: { name: name.trim() },
    });

    // Create audit event
    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'VAULT_CREATED', // Reusing closest event type; metadata distinguishes rename
      metadata: {
        action: 'rename',
        vaultId: id,
        oldName,
        newName: name.trim(),
      },
    });

    return NextResponse.json({ vault: updated });
  } catch (error: any) {
    console.error('Error updating vault:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
