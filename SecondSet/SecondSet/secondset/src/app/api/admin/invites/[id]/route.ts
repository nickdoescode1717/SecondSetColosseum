import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditEvent } from '@/lib/audit';

// DELETE /api/admin/invites/[id] - Revoke an invite
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    if (!user.roles?.includes('ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: requires ADMIN role' },
        { status: 403 }
      );
    }

    const { id } = await params;

    // Find the invite, scoped to org
    const invite = await prisma.invite.findFirst({
      where: {
        id,
        orgId: user.orgId,
      },
    });

    if (!invite) {
      return NextResponse.json(
        { error: 'Invite not found' },
        { status: 404 }
      );
    }

    if (invite.usedAt) {
      return NextResponse.json(
        { error: 'Invite has already been accepted' },
        { status: 400 }
      );
    }

    if (invite.revokedAt) {
      return NextResponse.json(
        { error: 'Invite has already been revoked' },
        { status: 400 }
      );
    }

    // Revoke the invite
    await prisma.invite.update({
      where: { id },
      data: { revokedAt: new Date() },
    });

    // Create audit event
    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'INVITE_REVOKED',
      metadata: {
        inviteId: invite.id,
        invitedEmail: invite.email,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error revoking invite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
