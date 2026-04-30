'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatUnits } from 'viem';

interface SwapRequest {
  id: string;
  status: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  fromTokenDecimals: number;
  toTokenDecimals: number;
  expectedOutput: string | null;
  chainName: string;
  memo: string | null;
  createdAt: string;
  vault: {
    name: string | null;
    address: string;
  };
  creator: {
    name: string;
  };
}

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-[#F3F4F6] text-[#6B7280]',
  REQUESTED: 'badge-warning',
  APPROVED: 'badge-primary',
  RELEASED: 'badge-info',
  CONFIRMED: 'badge-success',
  FAILED: 'badge-danger',
  CANCELLED: 'badge-danger',
};

export default function SwapsPage() {
  const [swaps, setSwaps] = useState<SwapRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    fetchSwaps();
  }, []);

  const fetchSwaps = async () => {
    try {
      const response = await fetch('/api/swaps');
      if (response.ok) {
        const data = await response.json();
        setSwaps(data);
      }
    } catch (error) {
      console.error('Failed to fetch swaps:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredSwaps = filterStatus
    ? swaps.filter(s => s.status === filterStatus)
    : swaps;

  if (loading) {
    return (
      <div className="fade-in">
        <div className="card-modern rounded-modern-lg p-12 text-center">
          <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-[#1DBFA4]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-[#6B7280]">Loading swaps...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-[#1F2937]">Stablecoin Swaps</h2>
          <p className="text-[#6B7280] mt-1">Manage and track stablecoin swap requests</p>
        </div>
        <Link
          href="/dashboard/swaps/new"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M7 16V4m0 0L3 8m4-4l4 4"></path>
            <path d="M17 8v12m0 0l4-4m-4 4l-4-4"></path>
          </svg>
          New Swap
        </Link>
      </div>

      {/* Filters */}
      {swaps.length > 0 && (
        <div className="card-modern rounded-modern-lg p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            <h4 className="font-bold text-[#1F2937]">Filters</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="input-modern w-full"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="REQUESTED">Requested</option>
                <option value="APPROVED">Approved</option>
                <option value="RELEASED">Released</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="FAILED">Failed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>
          {filterStatus && (
            <div className="mt-4 flex items-center justify-between pt-4 border-t border-[#E5E7EB]">
              <p className="text-sm text-[#6B7280]">
                Showing <span className="font-semibold text-[#1F2937]">{filteredSwaps.length}</span> of {swaps.length} swaps
              </p>
              <button
                onClick={() => setFilterStatus('')}
                className="text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* Swaps Table */}
      {filteredSwaps.length === 0 ? (
        <div className="card-modern p-12 text-center rounded-modern-lg">
          <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M7 16V4m0 0L3 8m4-4l4 4"></path>
            <path d="M17 8v12m0 0l4-4m-4 4l-4-4"></path>
          </svg>
          <p className="text-[#6B7280] mb-4">
            {swaps.length === 0 ? 'No swap requests yet' : 'No swaps match the selected filters'}
          </p>
          {swaps.length === 0 && (
            <Link
              href="/dashboard/swaps/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
            >
              Create Your First Swap
            </Link>
          )}
        </div>
      ) : (
        <div className="card-modern rounded-modern-lg overflow-hidden">
          <table className="table-modern">
            <thead>
              <tr>
                <th>Swap</th>
                <th>Amount</th>
                <th>Expected Output</th>
                <th>Vault</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredSwaps.map((swap) => (
                <tr key={swap.id}>
                  <td>
                    <Link href={`/dashboard/swaps/${swap.id}`} className="block group">
                      <div className="font-semibold text-[#1F2937] group-hover:text-[#1DBFA4] transition-colors">
                        {swap.fromToken} &rarr; {swap.toToken}
                      </div>
                      <div className="text-xs text-[#9CA3AF] mt-0.5">{swap.chainName}</div>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/dashboard/swaps/${swap.id}`} className="block font-semibold text-[#1F2937]">
                      {formatUnits(BigInt(swap.fromAmount), swap.fromTokenDecimals)} {swap.fromToken}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/dashboard/swaps/${swap.id}`} className="block text-[#6B7280]">
                      {swap.expectedOutput
                        ? `${formatUnits(BigInt(swap.expectedOutput), swap.toTokenDecimals)} ${swap.toToken}`
                        : '-'}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/dashboard/swaps/${swap.id}`} className="block text-[#6B7280]">
                      {swap.vault.name || swap.vault.address.slice(0, 10) + '...'}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/dashboard/swaps/${swap.id}`} className="block">
                      <span className={`badge-modern ${STATUS_BADGE[swap.status] || 'bg-[#F3F4F6] text-[#6B7280]'}`}>
                        {swap.status}
                      </span>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/dashboard/swaps/${swap.id}`} className="block text-[#6B7280]">
                      <div className="text-sm font-medium">{new Date(swap.createdAt).toLocaleDateString()}</div>
                      <div className="text-xs text-[#9CA3AF]">{swap.creator.name}</div>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
