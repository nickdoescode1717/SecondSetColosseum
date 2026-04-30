import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';
import { createAuditEvent } from '@/lib/audit';

// GET /api/admin/invites - List pending invites for org
export async function GET(req: NextRequest) {
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

    const invites = await prisma.invite.findMany({
      where: {
        orgId: user.orgId,
        usedAt: null,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ invites });
  } catch (error) {
    console.error('Error fetching invites:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin/invites - Create a new invite
export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { email, roles } = body;

    // Validate required fields
    if (!email || !roles || roles.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: email, roles' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate roles
    const validRoles = ['INITIATOR', 'APPROVER', 'SIGNER', 'ADMIN'];
    const invalidRoles = roles.filter((r: string) => !validRoles.includes(r));
    if (invalidRoles.length > 0) {
      return NextResponse.json(
        { error: `Invalid roles: ${invalidRoles.join(', ')}` },
        { status: 400 }
      );
    }

    // Check for INITIATOR + SIGNER conflict
    if (roles.includes('INITIATOR') && roles.includes('SIGNER')) {
      return NextResponse.json(
        { error: 'User cannot be both INITIATOR and SIGNER' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists in this org
    const existingUser = await prisma.user.findFirst({
      where: { email: normalizedEmail, orgId: user.orgId },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists in your organization' },
        { status: 409 }
      );
    }

    // Check for pending invite for this email in this org
    const existingInvite = await prisma.invite.findFirst({
      where: {
        email: normalizedEmail,
        orgId: user.orgId,
        usedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (existingInvite) {
      return NextResponse.json(
        { error: 'A pending invite already exists for this email' },
        { status: 409 }
      );
    }

    // Generate secure token and expiry
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.invite.create({
      data: {
        orgId: user.orgId,
        email: normalizedEmail,
        roles,
        token,
        expiresAt,
        createdBy: user.id,
      },
    });

    // Create audit event
    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'INVITE_CREATED',
      metadata: {
        inviteId: invite.id,
        invitedEmail: normalizedEmail,
        roles,
      },
    });

    // Build invite link
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const inviteLink = `${baseUrl}/invite/${token}`;

    return NextResponse.json(
      {
        invite: {
          id: invite.id,
          email: invite.email,
          roles: invite.roles,
          expiresAt: invite.expiresAt,
          link: inviteLink,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating invite:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
