import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';

// GET /api/admin/audit - Fetch audit logs
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

    // Get query parameters for filtering
    const { searchParams } = new URL(req.url);
    const eventType = searchParams.get('eventType');
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build where clause
    const where: any = {
      orgId: user.orgId,
    };

    if (eventType) {
      where.eventType = eventType;
    }

    if (userId) {
      where.userId = userId;
    }

    // Fetch audit events
    const [events, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          request: {
            select: {
              id: true,
              payee: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    return NextResponse.json({ 
      events,
      total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}