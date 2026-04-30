import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import PayeeApprovalActions from './PayeeApprovalActions';

export default async function PayeeApprovalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  
  const { id } = await params;

  // Check if user is an approver
  if (!user.roles?.includes('APPROVER')) {
    redirect('/dashboard/payees');
  }

  const payee = await prisma.payee.findUnique({
    where: { id },
    include: {
      creator: {
        select: { name: true, email: true },
      },
    },
  });

  if (!payee || payee.orgId !== user.orgId) {
    redirect('/dashboard/payees');
  }

  if (payee.status !== 'PENDING') {
    redirect('/dashboard/payees');
  }

  // Prevent self-approval
  const canApprove = payee.createdBy !== user.id;

  return (
    <div className="max-w-4xl fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/payees"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Payees
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold text-[#1F2937]">Review Payee</h2>
            <p className="text-[#6B7280] mt-1">Pending your approval</p>
          </div>
          <span className="badge-modern badge-warning">
            PENDING
          </span>
        </div>
      </div>

      {/* Warning for Self-Approval */}
      {!canApprove && (
        <div className="mb-6 bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-modern-md">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold text-yellow-800">Cannot Self-Approve</p>
              <p className="text-sm text-yellow-700 mt-1">
                You cannot approve this payee because you created it. Another approver must review it.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="card-modern rounded-modern-lg p-6">
            <h3 className="text-lg font-bold text-[#1F2937] mb-6">Payee Details</h3>
            
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Payee Name</p>
                <p className="text-xl font-bold text-[#1F2937]">{payee.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-6 pt-6 border-t border-[#E5E7EB]">
                <div>
                  <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Chain</p>
                  <span className="badge-modern badge-primary">
                    {payee.chain}
                  </span>
                </div>

                {payee.contactEmail && (
                  <div>
                    <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Contact Email</p>
                    <p className="text-sm text-[#1F2937]">{payee.contactEmail}</p>
                  </div>
                )}
              </div>

              <div className="pt-6 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Wallet Address</p>
                <div className="bg-[#F9FAFB] p-4 rounded-modern-md">
                  <p className="font-mono text-sm text-[#1F2937] break-all">{payee.address}</p>
                </div>
              </div>

              {payee.notes && (
                <div className="pt-6 border-t border-[#E5E7EB]">
                  <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Notes</p>
                  <p className="text-[#1F2937]">{payee.notes}</p>
                </div>
              )}

              <div className="pt-6 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Created By</p>
                <p className="font-bold text-[#1F2937]">{payee.creator.name}</p>
                <p className="text-sm text-[#6B7280] mt-1">{payee.creator.email}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="card-modern rounded-modern-lg p-6 sticky top-6">
            <h3 className="text-sm font-bold text-[#1F2937] uppercase tracking-wider mb-4">Request Info</h3>
            
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Status</p>
                <span className="badge-modern badge-warning">
                  PENDING
                </span>
              </div>

              <div className="pt-4 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Created</p>
                <p className="text-[#1F2937]">{new Date(payee.createdAt).toLocaleDateString()}</p>
                <p className="text-xs text-[#6B7280]">{new Date(payee.createdAt).toLocaleTimeString()}</p>
              </div>

              <div className="pt-4 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Next Steps</p>
                <div className="space-y-2">
                  {canApprove ? (
                    <>
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-[#1DBFA4] mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <p className="text-xs text-[#6B7280]">Approve to enable for payments</p>
                      </div>
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-[#DC2626] mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        <p className="text-xs text-[#6B7280]">Reject if not authorized</p>
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[#9CA3AF]">Waiting for another approver</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6">
        <PayeeApprovalActions payeeId={payee.id} canApprove={canApprove} />
      </div>
    </div>
  );
}