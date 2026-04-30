'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import QRCodeDisplay from './QRCodeDisplay';

interface RecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultId: string;
  vaultAddress: string;
  vaultChain: string;
}

type Step = 'warning' | 'qr' | 'participants' | 'progress' | 'complete' | 'error';

interface Participant {
  participant_type: string;
  role: string;
  connection_status: string;
  old_signer_index?: number;
  new_signer_index?: number;
  reported_address?: string;
  old_share_deletion_confirmed?: boolean;
}

export default function RecoveryModal({ isOpen, onClose, vaultId, vaultAddress, vaultChain }: RecoveryModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('warning');
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [coordinatorSessionId, setCoordinatorSessionId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [computedM, setComputedM] = useState<number | null>(null);
  const [computedNewN, setComputedNewN] = useState<number | null>(null);
  const [computedOldN, setComputedOldN] = useState<number | null>(null);
  const [recoveryRecord, setRecoveryRecord] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const completedRef = useRef(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep('warning');
      setSessionId(null);
      setCoordinatorSessionId(null);
      setQrCodeData(null);
      setReason('');
      setParticipants([]);
      setComputedM(null);
      setComputedNewN(null);
      setComputedOldN(null);
      setRecoveryRecord(null);
      setErrorMessage(null);
      setCancelling(false);
      completedRef.current = false;
    }
  }, [isOpen]);

  // Poll for status updates
  useEffect(() => {
    if (!sessionId || ['warning', 'complete', 'error'].includes(step)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/vaults/recovery/${sessionId}`);
        const data = await res.json();

        if (data.participants) {
          setParticipants(data.participants);
        }
        if (data.computedM) setComputedM(data.computedM);
        if (data.computedNewN) setComputedNewN(data.computedNewN);
        if (data.computedOldN) setComputedOldN(data.computedOldN);

        if (data.status === 'COMPLETED') {
          clearInterval(interval);
          completedRef.current = true;
          setRecoveryRecord(data.recoveryRecord);
          setStep('complete');
          toast.success('Vault recovery completed successfully!');
          router.refresh();
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setErrorMessage(data.errorMessage || 'Recovery failed');
          setStep('error');
          toast.error(`Recovery failed: ${data.errorMessage}`);
        } else if (data.status === 'EXPIRED') {
          clearInterval(interval);
          setErrorMessage('Recovery session expired');
          setStep('error');
          toast.error('Recovery session expired');
        } else if (data.status === 'CANCELLED') {
          clearInterval(interval);
          setStep('warning');
        } else if (data.status === 'LOCKED' || data.status === 'IN_PROGRESS' || data.status === 'VERIFYING') {
          if (step === 'qr' || step === 'participants') {
            setStep('progress');
          }
        }
      } catch (error) {
        console.error('Recovery polling error:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [step, sessionId, router]);

  const handleInitiate = async () => {
    if (reason.trim().length < 5) {
      toast.error('Please provide a reason for recovery (at least 5 characters)');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/vaults/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultId, reason }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to initiate recovery');

      setSessionId(data.sessionId);
      setCoordinatorSessionId(data.coordinatorSessionId);
      setQrCodeData(data.qrCodeData);
      setStep('qr');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLock = async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/vaults/recovery/${sessionId}/lock`, {
        method: 'POST',
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to lock ceremony');

      setComputedM(data.computedM);
      setComputedOldN(data.computedOldN);
      setComputedNewN(data.computedNewN);
      setStep('progress');
      toast.success('Ceremony locked! Recovery in progress...');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = async () => {
    if (sessionId && !completedRef.current && !['complete', 'error'].includes(step)) {
      try {
        setCancelling(true);
        await fetch(`/api/admin/vaults/recovery/${sessionId}/cancel`, {
          method: 'POST',
        });
        toast('Recovery session cancelled');
      } catch (error) {
        console.error('Failed to cancel recovery:', error);
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  const oldSigners = participants.filter(p => p.participant_type === 'old_signer');
  const newSigners = participants.filter(p => p.participant_type === 'new_signer');
  const connectedOldCount = oldSigners.filter(p => p.connection_status === 'connected').length;
  const connectedNewCount = newSigners.filter(p => p.connection_status === 'connected').length;
  const canLock = connectedOldCount >= 2 && connectedNewCount >= 1;

  return (
    <div className="fixed inset-0 bg-slate-200 bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card-modern rounded-modern-xl p-6 max-w-2xl w-full shadow-float max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-[#1F2937]">
            Vault Recovery
          </h3>
          <button
            onClick={handleClose}
            disabled={cancelling}
            className="text-[#9CA3AF] hover:text-[#6B7280] disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step 1: Warning & Intent */}
        {step === 'warning' && (
          <div className="space-y-5">
            <div className="bg-red-50 border-2 border-red-200 rounded-modern-lg p-4">
              <p className="text-sm font-semibold text-red-900 mb-2">
                Sensitive Operation
              </p>
              <p className="text-xs text-red-800">
                This will generate new key shares for vault <span className="font-mono">{vaultAddress.slice(0, 10)}...{vaultAddress.slice(-6)}</span> ({vaultChain}).
                Old key shares will be revoked. This action cannot be undone.
              </p>
            </div>

            <div className="bg-gradient-to-br from-[#E0F2FE] to-[#F9FAFB] rounded-modern-lg p-4">
              <p className="text-sm font-semibold text-[#1F2937] mb-2">
                How Recovery Works
              </p>
              <ul className="text-xs text-[#6B7280] space-y-1 list-disc list-inside">
                <li>At least 2 devices with existing key shares must join</li>
                <li>New devices join to receive fresh key shares</li>
                <li>The vault address remains the same</li>
                <li>Old shares are securely deleted after recovery</li>
                <li>New threshold is computed automatically (m = ceil(2n/3))</li>
              </ul>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                Reason for Recovery *
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Controller device was lost, need to re-enroll signers..."
                className="input-modern w-full h-24 resize-none"
              />
            </div>

            <button
              onClick={handleInitiate}
              disabled={loading || reason.trim().length < 5}
              className="w-full px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-full shadow-glow transition-all disabled:opacity-50"
            >
              {loading ? 'Initiating Recovery...' : 'Start Recovery Ceremony'}
            </button>
          </div>
        )}

        {/* Step 2: QR Code + Participants */}
        {(step === 'qr' || step === 'participants') && qrCodeData && (
          <div className="space-y-5">
            <QRCodeDisplay
              data={qrCodeData}
              title="Scan to Join Recovery"
              subtitle="Devices with existing key shares scan first, then new devices"
            />

            {/* Participant Status */}
            <div className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#1F2937] mb-1">
                  Old Signers ({connectedOldCount}/2 minimum)
                </p>
                {oldSigners.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">Waiting for devices with existing key shares...</p>
                ) : (
                  <div className="space-y-1">
                    {oldSigners.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${p.connection_status === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-[#6B7280]">{p.role} (index {p.old_signer_index})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="text-sm font-semibold text-[#1F2937] mb-1">
                  New Signers ({connectedNewCount} joined)
                </p>
                {newSigners.length === 0 ? (
                  <p className="text-xs text-[#9CA3AF]">Waiting for new devices to join...</p>
                ) : (
                  <div className="space-y-1">
                    {newSigners.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${p.connection_status === 'connected' ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className="text-[#6B7280]">{p.role} (new index {p.new_signer_index})</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={handleLock}
              disabled={!canLock || loading}
              className="w-full px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow transition-all disabled:opacity-50"
            >
              {loading ? 'Locking...' : canLock ? 'Lock & Start Recovery' : 'Waiting for participants (need 2+ old, 1+ new)'}
            </button>
          </div>
        )}

        {/* Step 3: Progress */}
        {step === 'progress' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <svg className="animate-spin h-12 w-12 text-orange-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <h4 className="text-lg font-bold text-[#1F2937]">
              Recovery Ceremony In Progress
            </h4>
            <p className="text-sm text-[#6B7280] text-center max-w-md">
              Devices are redistributing key shares using the resharing protocol.
              {computedM && computedNewN && (
                <span className="block mt-1 font-semibold">
                  New threshold: {computedM}-of-{computedNewN}
                </span>
              )}
            </p>
            <p className="text-xs text-[#9CA3AF]">
              Do not close this window. This may take 30-90 seconds.
            </p>
          </div>
        )}

        {/* Step 4: Complete */}
        {step === 'complete' && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-[#1F2937]">Recovery Complete</h4>
            </div>

            <div className="bg-gradient-to-br from-[#E0F2FE] to-[#F9FAFB] rounded-modern-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">Vault Address</span>
                <span className="font-mono text-[#1F2937] text-xs">{vaultAddress.slice(0, 10)}...{vaultAddress.slice(-6)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">New Threshold</span>
                <span className="font-semibold text-[#1F2937]">{computedM}-of-{computedNewN}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#6B7280]">Old Signers</span>
                <span className="text-[#1F2937]">{computedOldN} participated</span>
              </div>
            </div>

            {recoveryRecord && (
              <details className="text-xs">
                <summary className="cursor-pointer text-[#6B7280] hover:text-[#1F2937]">
                  View Recovery Record
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded-modern overflow-x-auto text-[10px] leading-relaxed">
                  {JSON.stringify(recoveryRecord, null, 2)}
                </pre>
              </details>
            )}

            <button
              onClick={onClose}
              className="w-full px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full"
            >
              Done
            </button>
          </div>
        )}

        {/* Error State */}
        {step === 'error' && (
          <div className="space-y-5">
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h4 className="text-lg font-bold text-[#1F2937]">Recovery Failed</h4>
              <p className="text-sm text-[#6B7280] text-center">{errorMessage}</p>
            </div>

            <button
              onClick={() => {
                setStep('warning');
                setSessionId(null);
                setErrorMessage(null);
              }}
              className="w-full px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
