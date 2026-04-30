import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcrypt';
import { createAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, name, password } = body;

    // Validate required fields
    if (!token || !name || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: token, name, password' },
        { status: 400 }
      );
    }

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Find invite by token
    const invite = await prisma.invite.findUnique({
      where: { token },
      include: {
        organization: { select: { name: true } },
      },
    });

    if (!invite) {
      return NextResponse.json(
        { error: 'Invalid invite link' },
        { status: 404 }
      );
    }

    if (invite.usedAt) {
      return NextResponse.json(
        { error: 'This invite has already been used' },
        { status: 400 }
      );
    }

    if (invite.revokedAt) {
      return NextResponse.json(
        { error: 'This invite has been revoked' },
        { status: 400 }
      );
    }

    if (new Date() > invite.expiresAt) {
      return NextResponse.json(
        { error: 'This invite has expired' },
        { status: 400 }
      );
    }

    // Check if user already exists in this org (idempotency guard)
    const existingUser = await prisma.user.findFirst({
      where: {
        email: invite.email,
        orgId: invite.orgId,
      },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists in this organization' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user and mark invite as used in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          orgId: invite.orgId,
          email: invite.email,
          name: name.trim(),
          hashedPassword,
          roleAssignments: {
            create: invite.roles.map((role) => ({
              role,
              assignedBy: invite.createdBy,
            })),
          },
        },
        include: {
          roleAssignments: { select: { role: true } },
        },
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: {
          usedAt: new Date(),
          usedBy: user.id,
        },
      });

      return user;
    });

    // Create audit event
    await createAuditEvent({
      orgId: invite.orgId,
      userId: result.id,
      eventType: 'INVITE_ACCEPTED',
      metadata: {
        inviteId: invite.id,
        invitedEmail: invite.email,
        roles: invite.roles,
        invitedBy: invite.createdBy,
      },
    });

    return NextResponse.json(
      {
        success: true,
        email: invite.email,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Accept invite error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
