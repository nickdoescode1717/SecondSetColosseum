import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import bcrypt from 'bcrypt';
import { createAuditEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orgName, name, email, password } = body;

    // Validate required fields
    if (!orgName || !name || !email || !password) {
      return NextResponse.json(
        { error: 'Missing required fields: orgName, name, email, password' },
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

    // Validate password length
    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Validate org name length
    if (orgName.trim().length < 2 || orgName.trim().length > 100) {
      return NextResponse.json(
        { error: 'Organization name must be between 2 and 100 characters' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check global email uniqueness (auth.ts uses findFirst without orgId)
    const existingUser = await prisma.user.findFirst({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create org + admin user in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: orgName.trim() },
      });

      const user = await tx.user.create({
        data: {
          orgId: org.id,
          email: normalizedEmail,
          name: name.trim(),
          hashedPassword,
          roleAssignments: {
            create: [{ role: 'ADMIN' }],
          },
        },
        include: {
          roleAssignments: { select: { role: true } },
        },
      });

      return { org, user };
    });

    // Create audit events (non-blocking)
    await createAuditEvent({
      orgId: result.org.id,
      userId: result.user.id,
      eventType: 'ORG_CREATED',
      metadata: { orgName: result.org.name },
    });

    await createAuditEvent({
      orgId: result.org.id,
      userId: result.user.id,
      eventType: 'USER_CREATED',
      metadata: {
        newUserId: result.user.id,
        newUserEmail: result.user.email,
        roles: ['ADMIN'],
        isFounder: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        orgId: result.org.id,
        userId: result.user.id,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
