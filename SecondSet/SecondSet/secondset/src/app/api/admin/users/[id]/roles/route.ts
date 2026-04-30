import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { createAuditEvent } from '@/lib/audit';

// POST /api/admin/users/[id]/roles - Update user roles
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const adminUser = session.user as any;
    const { id: userId } = await params;

    // Check ADMIN role
    if (!adminUser.roles?.includes('ADMIN')) {
      return NextResponse.json(
        { error: 'Forbidden: requires ADMIN role' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { roles } = body;

    if (!roles || !Array.isArray(roles)) {
      return NextResponse.json(
        { error: 'Invalid roles array' },
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

    // Fetch user to verify org
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.orgId !== adminUser.orgId) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Delete existing role assignments and create new ones
    await prisma.userRoleAssignment.deleteMany({
      where: { userId },
    });

    await prisma.userRoleAssignment.createMany({
      data: roles.map((role: string) => ({
        userId,
        role,
      })),
    });

    // Fetch updated user
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: {
          select: { role: true },
        },
      },
    });

    // Create audit event
    await createAuditEvent({
      orgId: adminUser.orgId,
      userId: adminUser.id,
      eventType: 'USER_ROLES_UPDATED',
      metadata: {
        targetUserId: userId,
        newRoles: roles,
      },
    });

    return NextResponse.json({ user: updatedUser });
  } catch (error) {
    console.error('Error updating roles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}