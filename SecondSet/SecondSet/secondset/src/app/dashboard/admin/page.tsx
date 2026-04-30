import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';

export default async function AdminOverviewPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;

  // Fetch stats
  const [users, vaults, requests, payees] = await Promise.all([
    prisma.user.count({ where: { orgId: user.orgId } }),
    prisma.vault.count({ where: { orgId: user.orgId } }),
    prisma.paymentRequest.count({ where: { orgId: user.orgId } }),
    prisma.payee.count({ where: { orgId: user.orgId } }),
  ]);

  // Fetch recent activity
  const recentRequests = await prisma.paymentRequest.findMany({
    where: { orgId: user.orgId },
    include: {
      creator: { select: { name: true } },
      payee: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  const recentUsers = await prisma.user.findMany({
    where: { orgId: user.orgId },
    include: {
      roleAssignments: {
        select: { role: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-[#1F2937]">Admin Overview</h2>
        <p className="text-[#6B7280] mt-1">System-wide statistics and recent activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
        <div className="card-modern rounded-modern-lg p-6 hover:shadow-float transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Total Users</p>
            <div className="w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-light text-[#1F2937] mb-3">{users}</p>
          <Link href="/dashboard/admin/users" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors">
            Manage
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="card-modern rounded-modern-lg p-6 hover:shadow-float transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Vaults</p>
            <div className="w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-light text-[#1F2937] mb-3">{vaults}</p>
          <Link href="/dashboard/admin/vaults" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors">
            Manage
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="card-modern rounded-modern-lg p-6 hover:shadow-float transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Total Requests</p>
            <div className="w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-light text-[#1F2937] mb-3">{requests}</p>
          <Link href="/dashboard/requests" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors">
            View
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <div className="card-modern rounded-modern-lg p-6 hover:shadow-float transition-all">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider">Payees</p>
            <div className="w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
          <p className="text-4xl font-light text-[#1F2937] mb-3">{payees}</p>
          <Link href="/dashboard/payees" className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors">
            View
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* Recent Activity - Two Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Requests */}
        <div className="card-modern rounded-modern-lg overflow-hidden">
          <div className="p-6 border-b border-[#E5E7EB]">
            <h3 className="text-lg font-bold text-[#1F2937]">Recent Requests</h3>
          </div>
          <div className="p-6">
            {recentRequests.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto mb-3 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-sm text-[#9CA3AF]">No requests yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentRequests.map((request) => (
                  <div key={request.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#F9FAFB] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1F2937] truncate">
                        {request.payee.name}
                      </p>
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)} {request.asset} • {request.creator.name}
                      </p>
                    </div>
                    <span className={`badge-modern ml-3 flex-shrink-0 ${
                      request.status === 'CONFIRMED' ? 'badge-success' :
                      request.status === 'BROADCASTED' ? 'badge-info' :
                      request.status === 'SUBMITTED' ? 'badge-warning' :
                      'bg-[#F3F4F6] text-[#6B7280]'
                    }`}>
                      {request.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Users */}
        <div className="card-modern rounded-modern-lg overflow-hidden">
          <div className="p-6 border-b border-[#E5E7EB]">
            <h3 className="text-lg font-bold text-[#1F2937]">Recent Users</h3>
          </div>
          <div className="p-6">
            {recentUsers.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto mb-3 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-sm text-[#9CA3AF]">No users yet</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentUsers.map((u) => (
                  <div key={u.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-[#F9FAFB] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#1F2937]">{u.name}</p>
                      <p className="text-xs text-[#6B7280] mt-0.5 truncate">{u.email}</p>
                    </div>
                    <div className="flex gap-1 flex-wrap ml-3">
                      {u.roleAssignments.map((ra) => (
                        <span
                          key={ra.role}
                          className="badge-modern badge-primary text-[10px]"
                        >
                          {ra.role}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}