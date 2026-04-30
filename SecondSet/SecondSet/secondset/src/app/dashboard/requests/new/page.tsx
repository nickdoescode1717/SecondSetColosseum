'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface Vault {
  id: string;
  name: string | null;
  chain: string;
  address: string;
}

interface Payee {
  id: string;
  name: string;
  chain: string;
  address: string;
}

const EVM_ASSETS = [
  { value: 'ETH', label: 'ETH', symbol: '\u27E0', decimals: 18 },
  { value: 'USDC', label: 'USDC', symbol: '$', decimals: 6 },
  { value: 'USDT', label: 'USDT', symbol: '$', decimals: 6 },
  { value: 'EURC', label: 'EURC', symbol: '\u20AC', decimals: 6 },
];

const SOLANA_ASSETS = [
  { value: 'SOL', label: 'SOL', symbol: 'S', decimals: 9 },
  { value: 'USDC', label: 'USDC', symbol: '$', decimals: 6 },
];

// Chain detection by address format
const resolveVaultChain = (address: string): 'EVM' | 'SOLANA' => {
  return address.startsWith('0x') ? 'EVM' : 'SOLANA';
};

const resolvePayeeChain = (address: string): 'EVM' | 'SOLANA' => {
  return address.startsWith('0x') ? 'EVM' : 'SOLANA';
};

export default function NewRequestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [filteredPayees, setFilteredPayees] = useState<Payee[]>([]);

  const [formData, setFormData] = useState({
    vaultId: '',
    payeeId: '',
    asset: 'USDC',
    amount: '',
    memo: '',
  });

  // Fetch vaults and payees on mount
  useEffect(() => {
    fetchVaults();
    fetchPayees();
  }, []);

  // Get resolved chain for selected vault
  const selectedVault = vaults.find(v => v.id === formData.vaultId);
  const vaultResolvedChain = selectedVault ? resolveVaultChain(selectedVault.address) : null;
  const availableAssets = vaultResolvedChain === 'SOLANA' ? SOLANA_ASSETS : EVM_ASSETS;

  // Filter payees when vault changes
  useEffect(() => {
    if (formData.vaultId && selectedVault) {
      const vaultChain = resolveVaultChain(selectedVault.address);
      const filtered = payees.filter(p => resolvePayeeChain(p.address) === vaultChain);
      setFilteredPayees(filtered);

      // Reset payee selection if current payee doesn't match chain
      const currentPayee = payees.find(p => p.id === formData.payeeId);
      if (currentPayee && resolvePayeeChain(currentPayee.address) !== vaultChain) {
        setFormData({ ...formData, payeeId: '' });
      }

      // Reset asset if not available for this chain
      const assetAvailable = availableAssets.some(a => a.value === formData.asset);
      if (!assetAvailable) {
        setFormData({ ...formData, asset: availableAssets[0]?.value || 'USDC' });
      }
    } else {
      setFilteredPayees(payees);
    }
  }, [formData.vaultId, vaults, payees]);

  const fetchVaults = async () => {
    try {
      const response = await fetch('/api/vaults');
      if (response.ok) {
        const data = await response.json();
        setVaults(data.vaults || []);
      } else {
        console.error('Failed to fetch vaults, status:', response.status);
        toast.error('Failed to load vaults');
      }
    } catch (err) {
      console.error('Error fetching vaults:', err);
      toast.error('Failed to load vaults');
    }
  };

  const fetchPayees = async () => {
    try {
      const response = await fetch('/api/payees');
      if (response.ok) {
        const data = await response.json();
        // Filter only approved payees
        const approvedPayees = (data.payees || []).filter((p: Payee & { status: string }) => p.status === 'APPROVED');
        setPayees(approvedPayees);
        setFilteredPayees(approvedPayees);
      }
    } catch (err) {
      console.error('Error fetching payees:', err);
      toast.error('Failed to load payees');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading('Creating payment request...');

    try {
      // Get decimals for selected asset
      const selectedAsset = availableAssets.find(a => a.value === formData.asset);
      const decimals = selectedAsset?.decimals || 6;

      // Convert amount to minor units
      const amountMinor = Math.floor(parseFloat(formData.amount) * Math.pow(10, decimals)).toString();

      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId: formData.vaultId,
          payeeId: formData.payeeId,
          asset: formData.asset,
          amountMinor,
          memo: formData.memo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create request');
      }

      // Success
      toast.success('Payment request created successfully!', { id: toastId });

      // Redirect after a brief delay
      setTimeout(() => {
        router.push('/dashboard/requests');
        router.refresh();
      }, 500);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create request', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl fade-in">
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
        <h2 className="text-3xl font-bold text-[#1F2937]">New Payment Request</h2>
        <p className="text-[#6B7280] mt-2">Create a new payment request for approval</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <div className="card-modern rounded-modern-lg p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Vault Selection */}
              <div>
                <label htmlFor="vault" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  From Vault *
                </label>
                <select
                  id="vault"
                  required
                  value={formData.vaultId}
                  onChange={(e) => setFormData({ ...formData, vaultId: e.target.value })}
                  className="input-modern w-full"
                >
                  <option value="">Select a vault</option>
                  {vaults.map((vault) => {
                    const chain = resolveVaultChain(vault.address);
                    return (
                      <option key={vault.id} value={vault.id}>
                        {vault.name || 'Unnamed Vault'} ({chain}) - {vault.address.slice(0, 10)}...
                      </option>
                    );
                  })}
                </select>
                {vaults.length === 0 && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    No vaults available. Contact an admin to create a vault.
                  </p>
                )}
              </div>

              {/* Asset Selection */}
              <div>
                <label htmlFor="asset" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Asset *
                </label>
                {vaultResolvedChain && (
                  <p className="text-xs text-[#6B7280] mb-3">
                    Available for {vaultResolvedChain} chain
                  </p>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {availableAssets.map((asset) => (
                    <button
                      key={asset.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, asset: asset.value })}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        formData.asset === asset.value
                          ? 'border-[#1DBFA4] bg-[#E0F2FE]'
                          : 'border-[#E5E7EB] bg-white hover:border-[#1DBFA4]'
                      }`}
                    >
                      <div className="text-3xl font-bold mb-1 text-[#1F2937]">{asset.symbol}</div>
                      <div className="text-sm font-semibold text-[#1F2937]">{asset.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payee Selection */}
              <div>
                <label htmlFor="payee" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  To Payee *
                </label>
                <select
                  id="payee"
                  required
                  value={formData.payeeId}
                  onChange={(e) => setFormData({ ...formData, payeeId: e.target.value })}
                  disabled={!formData.vaultId}
                  className="input-modern w-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">Select a payee</option>
                  {filteredPayees.map((payee) => {
                    const chain = resolvePayeeChain(payee.address);
                    return (
                      <option key={payee.id} value={payee.id}>
                        {payee.name} ({chain}) - {payee.address.slice(0, 10)}...
                      </option>
                    );
                  })}
                </select>
                {formData.vaultId && filteredPayees.length === 0 && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    No approved payees available for {vaultResolvedChain}. Add a payee first.
                  </p>
                )}
                {!formData.vaultId && (
                  <p className="mt-2 text-xs text-[#6B7280]">
                    Select a vault first
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label htmlFor="amount" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Amount ({formData.asset}) *
                </label>
                <input
                  id="amount"
                  type="number"
                  step={formData.asset === 'SOL' ? '0.000000001' : '0.01'}
                  min={formData.asset === 'SOL' ? '0.000000001' : '0.01'}
                  required
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="input-modern w-full"
                />
                <p className="mt-2 text-xs text-[#6B7280]">
                  Enter amount in {formData.asset} (e.g., {formData.asset === 'SOL' ? '1.5' : '1000.50'})
                </p>
              </div>

              {/* Memo */}
              <div>
                <label htmlFor="memo" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Memo / Description
                </label>
                <textarea
                  id="memo"
                  rows={4}
                  placeholder="Invoice #1234, payment for services..."
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  className="input-modern w-full resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-[#E5E7EB]">
                <button
                  type="submit"
                  disabled={loading || vaults.length === 0}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Creating...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Create Request
                    </>
                  )}
                </button>
                <Link
                  href="/dashboard/requests"
                  className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#1DBFA4] hover:text-[#1DBFA4] transition-all"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="lg:col-span-1">
          <div className="card-modern rounded-modern-lg p-6 sticky top-6">
            <h3 className="text-sm font-bold text-[#1F2937] uppercase tracking-wider mb-4">Request Info</h3>

            {vaultResolvedChain && (
              <div className="mb-4 p-3 bg-[#E0F2FE] rounded-lg">
                <p className="text-xs font-semibold text-[#1F2937] uppercase tracking-wider mb-1">Selected Chain</p>
                <p className="text-sm font-bold text-[#1DBFA4]">{vaultResolvedChain}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Multi-Party Approval</p>
                  <p className="text-xs text-[#6B7280] mt-1">Requires approval before release</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Secure Release</p>
                  <p className="text-xs text-[#6B7280] mt-1">Protected by multi-sig controls</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Full Audit Trail</p>
                  <p className="text-xs text-[#6B7280] mt-1">Every action is logged</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
              <p className="text-xs text-[#9CA3AF] leading-relaxed">
                Payment requests go through a multi-party approval process before being released to the blockchain.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
