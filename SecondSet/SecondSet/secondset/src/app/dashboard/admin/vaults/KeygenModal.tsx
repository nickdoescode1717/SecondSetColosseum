'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import QRCodeDisplay from './QRCodeDisplay';

interface KeygenModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeygenModal({ isOpen, onClose }: KeygenModalProps) {
  const router = useRouter();
  const [step, setStep] = useState<'config' | 'qr' | 'waiting'>('config');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qrCodeData, setQrCodeData] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const [formData, setFormData] = useState({
    chain: 'EVM',
    chainName: 'sepolia',
    name: '',
  });

  // Update chainName when chain type changes
  const handleChainChange = (newChain: string) => {
    setFormData({
      ...formData,
      chain: newChain,
      chainName: newChain === 'SOLANA' ? 'solana-devnet' : 'sepolia',
    });
  };

  // Track whether the session completed successfully so we don't cancel it on close
  const completedRef = useRef(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setStep('config');
      setSessionId(null);
      setQrCodeData(null);
      setFormData({ chain: 'EVM', chainName: 'sepolia', name: '' });
      setCancelling(false);
      completedRef.current = false;
    }
  }, [isOpen]);

  // Poll for completion
  useEffect(() => {
    if (step !== 'waiting' || !sessionId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/admin/vaults/keygen/${sessionId}`);
        const data = await res.json();

        if (data.status === 'COMPLETED') {
          clearInterval(interval);
          completedRef.current = true;
          toast.success('Wallet created successfully!');
          router.refresh();
          onClose();
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          toast.error(`Keygen failed: ${data.error}`);
          setStep('config');
        } else if (data.status === 'EXPIRED') {
          clearInterval(interval);
          toast.error('Session expired. Please try again.');
          setStep('config');
        } else if (data.status === 'CANCELLED') {
          clearInterval(interval);
          setStep('config');
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 3000); // Poll every 3 seconds

    return () => clearInterval(interval);
  }, [step, sessionId, router, onClose]);

  const handleInitiate = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/vaults/keygen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to initiate keygen');
      }

      setSessionId(data.sessionId);
      setQrCodeData(data.qrCodeData);
      setStep('qr');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    setStep('waiting');
  };

  const handleClose = async () => {
    // If we have an active session that hasn't completed, cancel it
    if (sessionId && (step === 'qr' || step === 'waiting') && !completedRef.current) {
      try {
        setCancelling(true);
        await fetch(`/api/admin/vaults/keygen/${sessionId}/cancel`, {
          method: 'POST',
        });
        toast('Session cancelled', { icon: '🚫' });
      } catch (error) {
        console.error('Failed to cancel session:', error);
        // Still close — the session will expire naturally
      }
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-200 bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card-modern rounded-modern-xl p-6 max-w-2xl w-full shadow-float">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-[#1F2937]">
            Create Multi-Sig Wallet
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

        {/* Step 1: Configuration */}
        {step === 'config' && (
          <div className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                Chain *
              </label>
              <select
                value={formData.chain}
                onChange={(e) => handleChainChange(e.target.value)}
                className="input-modern w-full"
              >
                <option value="EVM">EVM (Ethereum/Base)</option>
                <option value="SOLANA">Solana</option>
              </select>
            </div>

            {formData.chain === 'EVM' && (
              <div>
                <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Network *
                </label>
                <select
                  value={formData.chainName}
                  onChange={(e) => setFormData({ ...formData, chainName: e.target.value })}
                  className="input-modern w-full"
                >
                  <option value="sepolia">Sepolia (Testnet)</option>
                  <option value="base-sepolia">Base Sepolia (Testnet)</option>
                  <option value="ethereum">Ethereum Mainnet</option>
                  <option value="base">Base Mainnet</option>
                </select>
              </div>
            )}

            {formData.chain === 'SOLANA' && (
              <div>
                <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Network *
                </label>
                <select
                  value={formData.chainName}
                  onChange={(e) => setFormData({ ...formData, chainName: e.target.value })}
                  className="input-modern w-full"
                >
                  <option value="solana-devnet">Solana Devnet (Testnet)</option>
                  <option value="solana">Solana Mainnet</option>
                </select>
              </div>
            )}

            <div className="bg-gradient-to-br from-[#E0F2FE] to-[#F9FAFB] rounded-modern-lg p-4">
              <p className="text-sm font-semibold text-[#1F2937] mb-2">
                2-of-3 Multi-Signature Security
              </p>
              <p className="text-xs text-[#6B7280]">
                Your wallet will use Distributed Key Generation (DKG). You'll
                need 3 mobile devices to scan the QR code. Any 2 devices can
                sign transactions. Private keys never leave the devices.
              </p>
            </div>

            <button
              onClick={handleInitiate}
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all disabled:opacity-50"
            >
              {loading ? 'Initiating...' : 'Start Wallet Creation'}
            </button>
          </div>
        )}

        {/* Step 2: QR Code Display */}
        {step === 'qr' && qrCodeData && (
          <div className="space-y-5">
            <QRCodeDisplay
              data={qrCodeData}
              title="Scan with 3 Devices"
              subtitle="Each authorized signer should scan this QR code"
            />

            <div className="bg-yellow-50 border-2 border-yellow-200 rounded-modern-lg p-4">
              <p className="text-sm font-semibold text-yellow-900 mb-2">
                Important Instructions
              </p>
              <ul className="text-xs text-yellow-800 space-y-1 list-disc list-inside">
                <li>All 3 signers must scan within 5 minutes</li>
                <li>Keep this window open until all devices connect</li>
                <li>Do not refresh or close this page</li>
              </ul>
            </div>

            <button
              onClick={handleContinue}
              className="w-full px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full"
            >
              All Devices Scanned - Continue
            </button>
          </div>
        )}

        {/* Step 3: Waiting for Completion */}
        {step === 'waiting' && (
          <div className="flex flex-col items-center gap-4 py-8">
            <svg className="animate-spin h-12 w-12 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <h4 className="text-lg font-bold text-[#1F2937]">
              Generating Wallet...
            </h4>
            <p className="text-sm text-[#6B7280] text-center max-w-md">
              The devices are performing distributed key generation. This may
              take 30-60 seconds. Please wait...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
