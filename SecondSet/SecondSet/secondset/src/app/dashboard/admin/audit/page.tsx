import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import AuditLogTable from './AuditLogTable';

export default async function AuditLogPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;

  // Fetch initial audit events (first 50)
  const events = await prisma.auditEvent.findMany({
    where: { orgId: user.orgId },
    include: {
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      paymentRequest: {
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
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  // Get all users for filtering
  const users = await prisma.user.findMany({
    where: { orgId: user.orgId },
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: { name: 'asc' },
  });

  return (
    <div className="fade-in">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-xl font-bold text-[#1F2937]">Audit Log</h3>
            <p className="text-sm text-[#6B7280]">
              Complete history of all actions in the system
            </p>
          </div>
        </div>
      </div>

      <AuditLogTable initialEvents={events} users={users} />
    </div>
  );
}