import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcrypt';
import { createAuditEvent } from '@/lib/audit';

// GET /api/admin/users - List all users
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    // Check ADMIN role
    if (!user.roles?.includes('ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: requires ADMIN role' },
        { status: 403 }
      );
    }

    const users = await prisma.user.findMany({
      where: { orgId: user.orgId },
      include: {
        roleAssignments: {
          select: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/admin/users - Create a new user
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = session.user as any;

    // Check ADMIN role
    if (!user.roles?.includes('ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: requires ADMIN role' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, email, password, roles } = body;

    // Validate required fields
    if (!name || !email || !password || !roles || roles.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: name, email, password, roles' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existing = await prisma.user.findFirst({
      where: {
        email: email.toLowerCase(),
        orgId: user.orgId,
      },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
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

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with roles
    const newUser = await prisma.user.create({
      data: {
        orgId: user.orgId,
        email: email.toLowerCase(),
        name,
        hashedPassword,
        roleAssignments: {
          create: roles.map((role: string) => ({ role })),
        },
      },
      include: {
        roleAssignments: {
          select: { role: true },
        },
      },
    });

    // Create audit event
    await createAuditEvent({
      orgId: user.orgId,
      userId: user.id,
      eventType: 'USER_CREATED',
      metadata: {
        newUserId: newUser.id,
        newUserEmail: newUser.email,
        roles: newUser.roleAssignments.map((ra) => ra.role),
      },
    });

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}