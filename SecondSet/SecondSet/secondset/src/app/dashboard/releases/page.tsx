import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function ReleasesPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;

  // Check if user is a SIGNER
  if (!user.roles?.includes('SIGNER')) {
    redirect('/dashboard');
  }

  // Fetch requests ready to release
  const readyRequests = await prisma.paymentRequest.findMany({
    where: {
      orgId: user.orgId,
      status: 'READY_TO_RELEASE',
    },
    include: {
      payee: true,
      vault: true,
      creator: { select: { name: true, email: true, id: true } },
      approver: { select: { name: true, email: true, id: true } },
    },
    orderBy: { approvedAt: 'desc' },
  });

  // Separate into: can release vs created/approved by me
  const canRelease = readyRequests.filter(
    r => r.createdBy !== user.id && r.approvedBy !== user.id
  );
  const cannotRelease = readyRequests.filter(
    r => r.createdBy === user.id || r.approvedBy === user.id
  );

  // Also show recently released by this signer
  const recentlyReleased = await prisma.paymentRequest.findMany({
    where: {
      orgId: user.orgId,
      releasedBy: user.id,
      status: {
        in: ['BROADCASTED', 'CONFIRMED'],
      },
    },
    include: {
      payee: true,
      vault: true,
    },
    orderBy: { releasedAt: 'desc' },
    take: 5,
  });

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-[#1F2937]">Release Queue</h2>
        <p className="text-[#6B7280] mt-1">Sign and broadcast approved payments to blockchain</p>
      </div>

      {/* Requests I Can Release */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xl font-bold text-[#1F2937]">Ready to Release</h3>
          <span className="badge-modern badge-success">
            {canRelease.length}
          </span>
        </div>

        {canRelease.length === 0 ? (
          <div className="card-modern p-12 text-center rounded-modern-lg">
            <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[#6B7280] text-lg font-medium">All caught up!</p>
            <p className="text-[#9CA3AF] text-sm mt-2">No requests ready for release</p>
          </div>
        ) : (
          <div className="card-modern rounded-modern-lg overflow-hidden">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Created By</th>
                  <th>Approved By</th>
                  <th>Approved</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {canRelease.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div className="font-semibold text-[#1F2937]">
                        {request.payee.name}
                      </div>
                      {request.memo && (
                        <div className="text-xs text-[#9CA3AF] mt-0.5">{request.memo}</div>
                      )}
                    </td>
                    <td>
                      <div className="font-semibold text-[#1F2937]">
                        ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)}
                      </div>
                      <div className="text-xs text-[#6B7280]">{request.chain}</div>
                    </td>
                    <td className="text-[#6B7280]">
                      {request.creator.name}
                    </td>
                    <td className="text-[#6B7280]">
                      {request.approver?.name || '-'}
                    </td>
                    <td className="text-[#6B7280]">
                      {request.approvedAt
                        ? new Date(request.approvedAt).toLocaleDateString()
                        : '-'}
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/requests/${request.id}`}
                        className="inline-flex items-center gap-1 px-4 py-2 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 text-sm"
                      >
                        Release
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Requests I Created/Approved (Cannot Release) */}
      {cannotRelease.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xl font-bold text-[#6B7280]">Conflict of Interest</h3>
            <span className="badge-modern bg-[#F3F4F6] text-[#6B7280]">
              {cannotRelease.length}
            </span>
          </div>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-modern-md mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-yellow-800">Cannot Release</p>
                <p className="text-xs text-yellow-700 mt-1">
                  These payments were created or approved by you and require a different signer to prevent conflicts of interest.
                </p>
              </div>
            </div>
          </div>

          <div className="card-modern rounded-modern-lg overflow-hidden opacity-75">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Your Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cannotRelease.map((request) => (
                  <tr key={request.id}>
                    <td className="font-semibold text-[#6B7280]">
                      {request.payee.name}
                    </td>
                    <td className="font-semibold text-[#6B7280]">
                      ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)}
                    </td>
                    <td className="text-[#9CA3AF]">
                      {request.createdBy === user.id && 'Creator'}
                      {request.approvedBy === user.id && 'Approver'}
                    </td>
                    <td>
                      <span className="badge-modern bg-[#F3F4F6] text-[#6B7280]">
                        Need Different Signer
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recently Released */}
      {recentlyReleased.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xl font-bold text-[#6B7280]">Recently Released</h3>
            <span className="badge-modern bg-[#E0F2FE] text-[#0284C7]">
              {recentlyReleased.length}
            </span>
          </div>
          
          <div className="card-modern rounded-modern-lg overflow-hidden opacity-90">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Released</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentlyReleased.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <Link
                        href={`/dashboard/requests/${request.id}`}
                        className="font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
                      >
                        {request.payee.name}
                      </Link>
                    </td>
                    <td className="font-semibold text-[#6B7280]">
                      ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)}
                    </td>
                    <td className="text-[#9CA3AF]">
                      {request.releasedAt
                        ? new Date(request.releasedAt).toLocaleDateString()
                        : '-'}
                    </td>
                    <td>
                      <span className={`badge-modern ${
                        request.status === 'CONFIRMED' 
                          ? 'badge-success' 
                          : 'badge-info'
                      }`}>
                        {request.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}