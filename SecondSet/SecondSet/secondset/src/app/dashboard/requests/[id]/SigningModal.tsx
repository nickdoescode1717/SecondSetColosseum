'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface SigningModalProps {
  requestId: string;
  signingSessionId: string;
  onClose: () => void;
}

export default function SigningModal({
  requestId,
  signingSessionId,
  onClose,
}: SigningModalProps) {
  const router = useRouter();
  const [status, setStatus] = useState<string>('PENDING');
  const [error, setError] = useState<string | null>(null);

  const pollStatus = useCallback(async () => {
    try {
      const response = await fetch(`/api/requests/${requestId}/signing-status`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to check status');
      }

      const data = await response.json();
      setStatus(data.status);

      if (data.status === 'COMPLETED') {
        toast.success('Transaction signed and broadcasted!');
        onClose();
        router.refresh();
        return true; // stop polling
      }

      if (data.status === 'FAILED' || data.status === 'EXPIRED') {
        setError(data.error || `Signing session ${data.status.toLowerCase()}`);
        return true; // stop polling
      }

      return false; // continue polling
    } catch (err: any) {
      console.error('Polling error:', err);
      return false; // continue polling on transient errors
    }
  }, [requestId, onClose, router]);

  useEffect(() => {
    let stopped = false;

    const poll = async () => {
      while (!stopped) {
        const done = await pollStatus();
        if (done || stopped) break;
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    };

    poll();
    return () => { stopped = true; };
  }, [pollStatus]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 text-center">
        {error ? (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#2D527B] mb-2">Signing Failed</h3>
            <p className="text-sm text-slate-500 mb-6">{error}</p>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-[#2D527B] font-semibold rounded-full transition-all"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-teal-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-teal-600 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#2D527B] mb-2">Waiting for Mobile Signers</h3>
            <p className="text-sm text-slate-500 mb-2">
              A signing request has been sent to the mobile signer devices.
            </p>
            <p className="text-sm text-slate-400 mb-6">
              2 of 3 signers must approve on their mobile devices to complete the transaction.
            </p>
            <div className="flex items-center justify-center gap-2 text-xs text-slate-400 mb-6">
              <div className="w-2 h-2 bg-teal-500 rounded-full animate-pulse"></div>
              <span>Polling for updates...</span>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-[#2D527B] font-semibold rounded-full transition-all"
            >
              Close (signing continues in background)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
