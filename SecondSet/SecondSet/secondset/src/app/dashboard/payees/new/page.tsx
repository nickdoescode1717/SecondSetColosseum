'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function NewPayeePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    chain: 'EVM',
    address: '',
    name: '',
    contactEmail: '',
    notes: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading('Creating payee...');

    try {
      const response = await fetch('/api/payees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create payee');
      }

      // Success
      toast.success('Payee submitted for approval!', { id: toastId });
      
      // Redirect after a brief delay
      setTimeout(() => {
        router.push('/dashboard/payees');
        router.refresh();
      }, 500);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create payee', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl fade-in">
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
        <h2 className="text-3xl font-bold text-[#1F2937]">Add New Payee</h2>
        <p className="text-[#6B7280] mt-2">Create a new payment recipient for approval</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <div className="card-modern rounded-modern-lg p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Chain Selection */}
              <div>
                <label htmlFor="chain" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Chain *
                </label>
                <select
                  id="chain"
                  required
                  value={formData.chain}
                  onChange={(e) => setFormData({ ...formData, chain: e.target.value })}
                  className="input-modern w-full"
                >
                  <option value="EVM">EVM (Ethereum/Base)</option>
                  <option value="SOLANA">Solana</option>
                </select>
                <p className="mt-2 text-xs text-[#6B7280]">
                  Select the blockchain network for this payee
                </p>
              </div>

              {/* Address */}
              <div>
                <label htmlFor="address" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Wallet Address *
                </label>
                <input
                  id="address"
                  type="text"
                  required
                  placeholder={formData.chain === 'EVM' ? '0x...' : 'Base58 address'}
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="input-modern w-full font-mono text-sm"
                />
              </div>

              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Payee Name *
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  placeholder="e.g., Acme Corporation"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="input-modern w-full"
                />
              </div>

              {/* Contact Email */}
              <div>
                <label htmlFor="contactEmail" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Contact Email
                </label>
                <input
                  id="contactEmail"
                  type="email"
                  placeholder="contact@example.com"
                  value={formData.contactEmail}
                  onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
                  className="input-modern w-full"
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="notes" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Notes
                </label>
                <textarea
                  id="notes"
                  rows={4}
                  placeholder="Any additional information about this payee..."
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="input-modern w-full resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-[#E5E7EB]">
                <button
                  type="submit"
                  disabled={loading}
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
                      Create Payee
                    </>
                  )}
                </button>
                <Link
                  href="/dashboard/payees"
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
            <h3 className="text-sm font-bold text-[#1F2937] uppercase tracking-wider mb-4">Approval Required</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Multi-Party Approval</p>
                  <p className="text-xs text-[#6B7280] mt-1">Payees require approval before use</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Self-Approval Prevention</p>
                  <p className="text-xs text-[#6B7280] mt-1">You cannot approve your own payees</p>
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
                  <p className="text-xs text-[#6B7280] mt-1">All actions are logged and traceable</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
              <p className="text-xs text-[#9CA3AF] leading-relaxed">
                New payees must be approved by an authorized approver before they can be used in payment requests.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}