import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function ApprovalsPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;

  // Check if user is an APPROVER
  if (!user.roles?.includes('APPROVER')) {
    redirect('/dashboard');
  }

  // Fetch requests pending approval
  const pendingRequests = await prisma.paymentRequest.findMany({
    where: {
      orgId: user.orgId,
      status: 'SUBMITTED',
    },
    include: {
      payee: true,
      vault: true,
      creator: { select: { name: true, email: true, id: true } },
    },
    orderBy: { submittedAt: 'desc' },
  });

  // Separate into: can approve vs created by me
  const canApprove = pendingRequests.filter(r => r.createdBy !== user.id);
  const cannotApprove = pendingRequests.filter(r => r.createdBy === user.id);

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-[#1F2937]">Approvals Queue</h2>
        <p className="text-[#6B7280] mt-1">Review and approve payment requests</p>
      </div>

      {/* Requests I Can Approve */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xl font-bold text-[#1F2937]">Pending Your Approval</h3>
          <span className="badge-modern badge-warning">
            {canApprove.length}
          </span>
        </div>

        {canApprove.length === 0 ? (
          <div className="card-modern p-12 text-center rounded-modern-lg">
            <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-[#6B7280] text-lg font-medium">All caught up!</p>
            <p className="text-[#9CA3AF] text-sm mt-2">No requests pending your approval</p>
          </div>
        ) : (
          <div className="card-modern rounded-modern-lg overflow-hidden">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Created By</th>
                  <th>Submitted</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {canApprove.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div className="font-semibold text-[#1F2937]">
                        {request.payee.name}
                      </div>
                      {request.memo && (
                        <div className="text-xs text-[#9CA3AF] mt-0.5">{request.memo}</div>
                      )}
                    </td>
                    <td className="font-semibold text-[#1F2937]">
                      ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)}
                    </td>
                    <td className="text-[#6B7280]">
                      {request.creator.name}
                    </td>
                    <td className="text-[#6B7280]">
                      {request.submittedAt
                        ? new Date(request.submittedAt).toLocaleDateString()
                        : '-'}
                    </td>
                    <td>
                      <Link
                        href={`/dashboard/requests/${request.id}`}
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
                      >
                        Review
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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

      {/* Requests I Created (Cannot Self-Approve) */}
      {cannotApprove.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xl font-bold text-[#6B7280]">Awaiting Other Approver</h3>
            <span className="badge-modern bg-[#F3F4F6] text-[#6B7280]">
              {cannotApprove.length}
            </span>
          </div>
          
          <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-modern-md mb-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-yellow-800">Cannot Self-Approve</p>
                <p className="text-xs text-yellow-700 mt-1">
                  These requests were created by you and require approval from another authorized approver.
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
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {cannotApprove.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div className="font-semibold text-[#6B7280]">
                        {request.payee.name}
                      </div>
                      {request.memo && (
                        <div className="text-xs text-[#9CA3AF] mt-0.5">{request.memo}</div>
                      )}
                    </td>
                    <td className="font-semibold text-[#6B7280]">
                      ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)}
                    </td>
                    <td className="text-[#9CA3AF]">
                      {request.submittedAt
                        ? new Date(request.submittedAt).toLocaleDateString()
                        : '-'}
                    </td>
                    <td>
                      <span className="badge-modern bg-[#F3F4F6] text-[#6B7280]">
                        Awaiting approval
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