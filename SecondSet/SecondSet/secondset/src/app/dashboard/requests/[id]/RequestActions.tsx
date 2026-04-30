'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import SigningModal from './SigningModal';

interface RequestActionsProps {
  requestId: string;
  canSubmit: boolean;
  canApprove: boolean;
  canApproveReject: boolean;
  canRelease: boolean;
  canSignerReject: boolean;
  canRetry: boolean;
  releaseToken?: string | null;
}

export default function RequestActions({
  requestId,
  canSubmit,
  canApprove,
  canApproveReject,
  canRelease,
  canSignerReject,
  canRetry,
  releaseToken,
}: RequestActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [signingSessionId, setSigningSessionId] = useState<string | null>(null);
  const [showSigningModal, setShowSigningModal] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    const toastId = toast.loading('Submitting for approval...');

    try {
      const response = await fetch(`/api/requests/${requestId}/submit`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit');
      }

      toast.success('Payment request submitted successfully!', { id: toastId });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit request', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    const toastId = toast.loading('Approving payment request...');

    try {
      const response = await fetch(`/api/requests/${requestId}/approve`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve');
      }

      toast.success('Payment request approved! Ready for release.', { id: toastId });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve request', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    const toastId = toast.loading('Rejecting payment request...');

    try {
      const response = await fetch(`/api/requests/${requestId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason || undefined }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject');
      }

      toast.success('Payment request rejected', { id: toastId });
      setShowRejectModal(false);
      setRejectReason('');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject request', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async () => {
    if (!releaseToken) {
      toast.error('Release token not available');
      return;
    }

    setLoading(true);
    const toastId = toast.loading('Releasing payment to blockchain...');

    try {
      const response = await fetch(`/api/requests/${requestId}/release`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releaseToken }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to release');
      }

      const data = await response.json();

      if (data.signingSessionId) {
        // Production mode: signing session created, show modal to wait for mobile signers
        toast.success('Signing session created. Waiting for mobile signers...', { id: toastId });
        setSigningSessionId(data.signingSessionId);
        setShowSigningModal(true);
      } else {
        // Test signer mode: already signed and broadcasted
        toast.success('Payment released! Broadcasting to blockchain...', { id: toastId });
        router.refresh();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to release payment', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    setLoading(true);
    const toastId = toast.loading('Retrying broadcast...');

    try {
      const response = await fetch(`/api/requests/${requestId}/retry`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to retry');
      }

      toast.success('Broadcast retry initiated', { id: toastId });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to retry broadcast', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  if (!canSubmit && !canApprove && !canApproveReject && !canRelease && !canSignerReject && !canRetry) {
    return null;
  }

  return (
    <>
      <div className="border-t pt-6">
        <div className="flex gap-3">
          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Submit for Approval
                </>
              )}
            </button>
          )}

          {canApprove && (
            <button
              onClick={handleApprove}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Approving...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Approve
                </>
              )}
            </button>
          )}

          {canApproveReject && (
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-red-500 to-red-700 text-white font-semibold rounded-full shadow-[0_8px_20px_-4px_rgba(239,68,68,0.4)] hover:shadow-[0_20px_40px_-10px_rgba(239,68,68,0.3)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Reject
            </button>
          )}

          {canRelease && (
            <button
              onClick={handleRelease}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Releasing...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Release Payment
                </>
              )}
            </button>
          )}

          {canSignerReject && (
            <button
              onClick={() => setShowRejectModal(true)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-orange-500 to-orange-700 text-white font-semibold rounded-full shadow-[0_8px_20px_-4px_rgba(249,115,22,0.4)] hover:shadow-[0_20px_40px_-10px_rgba(249,115,22,0.3)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Reject & Send Back
            </button>
          )}

          {canRetry && (
            <button
              onClick={handleRetry}
              disabled={loading}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-yellow-500 to-yellow-700 text-white font-semibold rounded-full shadow-[0_8px_20px_-4px_rgba(234,179,8,0.4)] hover:shadow-[0_20px_40px_-10px_rgba(234,179,8,0.3)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Retrying...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Retry Release
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Signing Modal */}
      {showSigningModal && signingSessionId && (
        <SigningModal
          requestId={requestId}
          signingSessionId={signingSessionId}
          onClose={() => {
            setShowSigningModal(false);
            setSigningSessionId(null);
            router.refresh();
          }}
        />
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-[#2D527B] mb-4">Reject Payment Request</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-semibold text-[#2D527B] mb-2">
                Reason for rejection (optional)
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Explain why this request is being rejected..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 text-[#0B1220]"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-br from-red-500 to-red-700 text-white font-semibold rounded-full shadow-[0_8px_20px_-4px_rgba(239,68,68,0.4)] hover:shadow-[0_20px_40px_-10px_rgba(239,68,68,0.3)] transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Rejecting...
                  </>
                ) : (
                  'Confirm Rejection'
                )}
              </button>
              <button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                }}
                disabled={loading}
                className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-[#2D527B] font-semibold rounded-full transition-all hover:-translate-y-0.5 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}