'use client';

import { useState, useEffect, use } from 'react';
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

interface Request {
  id: string;
  vaultId: string;
  payeeId: string;
  amountMinor: string;
  memo: string | null;
  status: string;
  createdBy: string;
}

export default function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [request, setRequest] = useState<Request | null>(null);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [filteredPayees, setFilteredPayees] = useState<Payee[]>([]);
  
  const [formData, setFormData] = useState({
    vaultId: '',
    payeeId: '',
    amount: '',
    memo: '',
  });

  // Fetch request details
  useEffect(() => {
    fetchRequest();
    fetchVaults();
    fetchPayees();
  }, []);

  // Filter payees when vault changes
  useEffect(() => {
    if (formData.vaultId) {
      const selectedVault = vaults.find(v => v.id === formData.vaultId);
      if (selectedVault) {
        const filtered = payees.filter(p => p.chain === selectedVault.chain);
        setFilteredPayees(filtered);
        
        // Reset payee selection if current payee doesn't match chain
        const currentPayee = payees.find(p => p.id === formData.payeeId);
        if (currentPayee && currentPayee.chain !== selectedVault.chain) {
          setFormData({ ...formData, payeeId: '' });
        }
      }
    } else {
      setFilteredPayees(payees);
    }
  }, [formData.vaultId, vaults, payees]);

  const fetchRequest = async () => {
    try {
      const response = await fetch(`/api/requests/${resolvedParams.id}`);
      if (response.ok) {
        const data = await response.json();
        setRequest(data.request);
        
        // Pre-fill form
        setFormData({
          vaultId: data.request.vaultId,
          payeeId: data.request.payeeId,
          amount: (parseInt(data.request.amountMinor) / 1_000_000).toString(),
          memo: data.request.memo || '',
        });
      } else {
        toast.error('Failed to load request');
        router.push('/dashboard/requests');
      }
    } catch (err) {
      console.error('Error fetching request:', err);
      toast.error('Failed to load request');
      router.push('/dashboard/requests');
    } finally {
      setFetchLoading(false);
    }
  };

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
        setPayees(data.payees || []);
        setFilteredPayees(data.payees || []);
      }
    } catch (err) {
      console.error('Error fetching payees:', err);
      toast.error('Failed to load payees');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading('Updating payment request...');

    try {
      const amountMinor = Math.floor(parseFloat(formData.amount) * 1_000_000).toString();

      const response = await fetch(`/api/requests/${resolvedParams.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId: formData.vaultId,
          payeeId: formData.payeeId,
          amountMinor,
          memo: formData.memo,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update request');
      }

      toast.success('Payment request updated!', { id: toastId });
      router.push(`/dashboard/requests/${resolvedParams.id}`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update request', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    const toastId = toast.loading('Submitting for approval...');

    try {
      const response = await fetch(`/api/requests/${resolvedParams.id}/submit`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit');
      }

      toast.success('Payment request submitted successfully!', { id: toastId });
      router.push('/dashboard/requests');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit request', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="max-w-3xl fade-in">
        <div className="card-modern rounded-modern-lg p-12 text-center">
          <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-[#1DBFA4]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-[#6B7280]">Loading request...</p>
        </div>
      </div>
    );
  }

  if (!request || request.status !== 'DRAFT') {
    router.push('/dashboard/requests');
    return null;
  }

  const selectedVault = vaults.find(v => v.id === formData.vaultId);

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
        <h2 className="text-3xl font-bold text-[#1F2937]">Edit Payment Request</h2>
        <p className="text-[#6B7280] mt-2">Update details or submit for approval</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <div className="card-modern rounded-modern-lg p-6">
            <form onSubmit={handleUpdate} className="space-y-6">
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
                  {vaults.map((vault) => (
                    <option key={vault.id} value={vault.id}>
                      {vault.name || 'Unnamed Vault'} ({vault.chain}) - {vault.address.slice(0, 10)}...
                    </option>
                  ))}
                </select>
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
                  {filteredPayees.map((payee) => (
                    <option key={payee.id} value={payee.id}>
                      {payee.name} ({payee.chain}) - {payee.address.slice(0, 10)}...
                    </option>
                  ))}
                </select>
                {formData.vaultId && filteredPayees.length === 0 && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    No payees available for {selectedVault?.chain}. Add a payee first.
                  </p>
                )}
              </div>

              {/* Amount */}
              <div>
                <label htmlFor="amount" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Amount (USDC) *
                </label>
                <input
                  id="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="input-modern w-full"
                />
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
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#6B7280] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      Save Draft
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
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
              </div>
            </form>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="lg:col-span-1">
          <div className="card-modern rounded-modern-lg p-6 sticky top-6">
            <h3 className="text-sm font-bold text-[#1F2937] uppercase tracking-wider mb-4">Draft Options</h3>
            
            <div className="space-y-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#F3F4F6] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#6B7280]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-[#1F2937]">Save Draft</p>
                  <p className="text-xs text-[#6B7280] mt-1">Keep editing later</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-[#1F2937]">Submit</p>
                  <p className="text-xs text-[#6B7280] mt-1">Send for approval</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
              <p className="text-xs text-[#9CA3AF] leading-relaxed">
                Once submitted, this request cannot be edited and will require approval before release.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}