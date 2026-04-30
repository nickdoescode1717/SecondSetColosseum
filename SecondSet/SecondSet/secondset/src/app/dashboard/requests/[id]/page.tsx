import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import RequestActions from './RequestActions';
import ConfirmationPoller from './ConfirmationPoller';

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  
  const { id } = await params;

  const request = await prisma.paymentRequest.findUnique({
    where: { id },
    include: {
      payee: true,
      vault: true,
      creator: { select: { name: true, email: true, id: true } },
      submitter: { select: { name: true, email: true } },
      approver: { select: { name: true, email: true } },
      releaser: { select: { name: true, email: true } },
    },
  });

  if (!request || request.orgId !== user.orgId) {
    redirect('/dashboard/requests');
  }

  const canSubmit = request.status === 'DRAFT' && request.createdBy === user.id;

  const canApprove = 
    request.status === 'SUBMITTED' && 
    user.roles?.includes('APPROVER') &&
    request.createdBy !== user.id;

  const canApproveReject = canApprove;

  const canRelease = 
    request.status === 'READY_TO_RELEASE' && 
    user.roles?.includes('SIGNER') &&
    request.createdBy !== user.id &&
    request.approvedBy !== user.id;

  const canSignerReject = canRelease;

  const canRetry = 
    request.status === 'FAILED_BROADCAST' &&
    user.roles?.includes('SIGNER');

  return (
    <div className="max-w-5xl fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/requests"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Requests
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-3xl font-bold text-[#1F2937]">Payment Request</h2>
            <p className="text-sm text-[#6B7280] mt-1 font-mono">#{request.id.slice(0, 8)}</p>
          </div>
          <span className={`badge-modern ${
            request.status === 'CONFIRMED' ? 'badge-success' :
            request.status === 'DRAFT' ? 'bg-[#F3F4F6] text-[#6B7280]' :
            request.status === 'SUBMITTED' ? 'badge-warning' :
            request.status === 'APPROVED' || request.status === 'READY_TO_RELEASE' ? 'badge-primary' :
            request.status === 'REJECTED' ? 'badge-danger' :
            request.status === 'FAILED_BROADCAST' ? 'badge-warning' :
            request.status === 'BROADCASTED' ? 'badge-info' :
            'badge-info'
          }`}>
            {request.status}
          </span>
        </div>
      </div>

      {/* Error Message */}
      {request.errorMessage && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-modern-md">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="font-semibold text-red-800">Error</p>
              <p className="text-sm text-red-700 mt-1">{request.errorMessage}</p>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Poller */}
      <ConfirmationPoller
        requestId={request.id}
        status={request.status}
        txHash={request.txHash}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Payment Details Card */}
          <div className="card-modern rounded-modern-lg p-6">
            <h3 className="text-lg font-bold text-[#1F2937] mb-6">Payment Details</h3>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">From Vault</p>
                <p className="font-bold text-[#1F2937]">{request.vault.name || 'Unnamed Vault'}</p>
                <p className="text-sm text-[#6B7280] font-mono mt-1">
                  {request.vault.address.slice(0, 10)}...{request.vault.address.slice(-8)}
                </p>
                <span className="badge-modern badge-primary mt-2">
                  {request.vault.chain}
                </span>
              </div>

              <div>
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">To Payee</p>
                <p className="font-bold text-[#1F2937]">{request.payee.name}</p>
                <p className="text-sm text-[#6B7280] font-mono mt-1">
                  {request.payee.address.slice(0, 10)}...{request.payee.address.slice(-8)}
                </p>
                {request.payee.contactEmail && (
                  <p className="text-sm text-[#6B7280] mt-2">{request.payee.contactEmail}</p>
                )}
              </div>

              <div className="col-span-2 pt-6 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Amount</p>
                <p className="text-4xl font-light text-[#1F2937]">
                  ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)}
                </p>
                <p className="text-sm text-[#6B7280] mt-1">{request.asset}</p>
              </div>
            </div>

            {request.memo && (
              <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Memo</p>
                <p className="text-[#1F2937]">{request.memo}</p>
              </div>
            )}
          </div>

          {/* Timeline Card */}
          <div className="card-modern rounded-modern-lg p-6">
            <h3 className="text-lg font-bold text-[#1F2937] mb-6">Timeline</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-[#E5E7EB] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-[#1F2937]">Created</p>
                  <p className="text-sm text-[#6B7280] mt-0.5">
                    {new Date(request.createdAt).toLocaleString()}
                  </p>
                  <p className="text-xs text-[#9CA3AF] mt-1">by {request.creator.name}</p>
                </div>
              </div>

              {request.submittedAt && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#FFEDD5] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#C2410C]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#1F2937]">Submitted</p>
                    <p className="text-sm text-[#6B7280] mt-0.5">
                      {new Date(request.submittedAt).toLocaleString()}
                    </p>
                    {request.submitter && (
                      <p className="text-xs text-[#9CA3AF] mt-1">by {request.submitter.name}</p>
                    )}
                  </div>
                </div>
              )}

              {request.approvedAt && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#CCF5ED] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#1F2937]">Approved</p>
                    <p className="text-sm text-[#6B7280] mt-0.5">
                      {new Date(request.approvedAt).toLocaleString()}
                    </p>
                    {request.approver && (
                      <p className="text-xs text-[#9CA3AF] mt-1">by {request.approver.name}</p>
                    )}
                  </div>
                </div>
              )}

              {request.releasedAt && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#0284C7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#1F2937]">Released</p>
                    <p className="text-sm text-[#6B7280] mt-0.5">
                      {new Date(request.releasedAt).toLocaleString()}
                    </p>
                    {request.releaser && (
                      <p className="text-xs text-[#9CA3AF] mt-1">by {request.releaser.name}</p>
                    )}
                  </div>
                </div>
              )}

              {request.broadcastedAt && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#DBEAFE] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#0284C7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#1F2937]">Broadcasted</p>
                    <p className="text-sm text-[#6B7280] mt-0.5">
                      {new Date(request.broadcastedAt).toLocaleString()}
                    </p>
                    {request.txHash && request.explorerUrl && (
                      <a
                        href={request.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-[#1DBFA4] hover:text-[#179983] font-semibold mt-2"
                      >
                        View on Explorer
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    )}
                  </div>
                </div>
              )}

              {request.confirmedAt && (
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#DCFCE7] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-[#15803D]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-[#1F2937]">Confirmed</p>
                    <p className="text-sm text-[#6B7280] mt-0.5">
                      {new Date(request.confirmedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-[#15803D] font-semibold mt-1">Transaction complete</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="card-modern rounded-modern-lg p-6 sticky top-6">
            <h3 className="text-sm font-bold text-[#1F2937] uppercase tracking-wider mb-4">Request Info</h3>
            
            <div className="space-y-4 text-sm">
              <div>
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Created By</p>
                <p className="text-[#1F2937] font-semibold">{request.creator.name}</p>
                <p className="text-xs text-[#6B7280]">{request.creator.email}</p>
              </div>

              <div className="pt-4 border-t border-[#E5E7EB]">
                <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-1">Created</p>
                <p className="text-[#1F2937]">{new Date(request.createdAt).toLocaleDateString()}</p>
                <p className="text-xs text-[#6B7280]">{new Date(request.createdAt).toLocaleTimeString()}</p>
              </div>

              {request.txHash && (
                <div className="pt-4 border-t border-[#E5E7EB]">
                  <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Transaction</p>
                  <p className="text-xs text-[#1F2937] font-mono break-all bg-[#F9FAFB] p-2 rounded">
                    {request.txHash}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-6">
        <RequestActions
          requestId={request.id}
          canSubmit={canSubmit}
          canApprove={canApprove}
          canApproveReject={canApproveReject}
          canRelease={canRelease}
          canSignerReject={canSignerReject}
          canRetry={canRetry}
          releaseToken={request.releaseToken}
        />
      </div>
    </div>
  );
}