'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface PaymentRequest {
  id: string;
  status: string;
  amountMinor: string;
  asset: string;
  chain: string;
  memo: string | null;
  createdAt: Date;
  submittedAt: Date | null;
  approvedAt: Date | null;
  releasedAt: Date | null;
  broadcastedAt: Date | null;
  confirmedAt: Date | null;
  txHash: string | null;
  explorerUrl: string | null;
  createdBy: string;
  payee: {
    name: string;
    address: string;
  };
  vault: {
    name: string | null;
    address: string;
    chain: string;
  };
  creator: {
    name: string;
  };
}

export default function RequestsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [userId, setUserId] = useState('');
  
  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterChain, setFilterChain] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    try {
      const response = await fetch('/api/requests');
      const data = await response.json();
      setRequests(data.requests || []);
      setCanCreate(data.canCreate || false);
      setUserId(data.userId || '');
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDraft = async (requestId: string) => {
    if (!confirm('Are you sure you want to delete this draft? This action cannot be undone.')) {
      return;
    }

    const toastId = toast.loading('Deleting draft...');
    
    try {
      const response = await fetch(`/api/requests/${requestId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete draft');
      }

      toast.success('Draft deleted successfully!', { id: toastId });
      fetchRequests();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete draft', { id: toastId });
    }
  };

  // Separate drafts from other requests
  const draftRequests = requests.filter(r => r.status === 'DRAFT');
  const otherRequests = requests.filter(r => r.status !== 'DRAFT');

  // Apply filters to other requests
  const filteredRequests = otherRequests.filter((request) => {
    if (filterStatus && request.status !== filterStatus) return false;
    if (filterChain && request.chain !== filterChain) return false;
    
    const requestDate = new Date(request.createdAt);
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (requestDate < start) return false;
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (requestDate > end) return false;
    }
    
    return true;
  });

  // Get unique chains for filter
  const uniqueChains = Array.from(new Set(otherRequests.map(r => r.chain)));

  const exportToCSV = () => {
    // CSV headers
    const headers = [
      'Request ID',
      'Status',
      'Payee Name',
      'Payee Address',
      'Amount',
      'Asset',
      'Chain',
      'Vault Name',
      'Vault Address',
      'Memo',
      'Created At',
      'Created By',
      'Submitted At',
      'Approved At',
      'Released At',
      'Broadcasted At',
      'Confirmed At',
      'Transaction Hash',
      'Explorer URL',
    ];

    // Convert requests to CSV rows
    const rows = filteredRequests.map((request) => {
      return [
        request.id,
        request.status,
        request.payee.name,
        request.payee.address,
        (parseInt(request.amountMinor) / 1_000_000).toFixed(2),
        request.asset,
        request.chain,
        request.vault.name || 'Unnamed Vault',
        request.vault.address,
        request.memo || '',
        new Date(request.createdAt).toISOString(),
        request.creator.name,
        request.submittedAt ? new Date(request.submittedAt).toISOString() : '',
        request.approvedAt ? new Date(request.approvedAt).toISOString() : '',
        request.releasedAt ? new Date(request.releasedAt).toISOString() : '',
        request.broadcastedAt ? new Date(request.broadcastedAt).toISOString() : '',
        request.confirmedAt ? new Date(request.confirmedAt).toISOString() : '',
        request.txHash || '',
        request.explorerUrl || '',
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(cell => {
          const cellStr = String(cell);
          if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
            return `"${cellStr.replace(/"/g, '""')}"`;
          }
          return cellStr;
        }).join(',')
      )
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const filename = `payment_requests_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="fade-in">
        <div className="card-modern rounded-modern-lg p-12 text-center">
          <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-[#1DBFA4]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-[#6B7280]">Loading requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-[#1F2937]">Payment Requests</h2>
          <p className="text-[#6B7280] mt-1">Manage and track all payment requests</p>
        </div>
        {canCreate && (
          <Link
            href="/dashboard/requests/new"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Request
          </Link>
        )}
      </div>

      {/* Draft Requests Section */}
      {draftRequests.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xl font-bold text-[#1F2937]">Drafts</h3>
            <span className="badge-modern bg-[#FEF3C7] text-[#92400E]">
              {draftRequests.length}
            </span>
          </div>
          <div className="card-modern rounded-modern-lg overflow-hidden">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Chain</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {draftRequests.map((request) => {
                  const canEdit = request.createdBy === userId;
                  
                  return (
                    <tr key={request.id}>
                      <td>
                        <div className="font-semibold text-[#1F2937]">
                          {request.payee.name}
                        </div>
                        {request.memo && (
                          <div className="text-xs text-[#9CA3AF] mt-0.5">{request.memo}</div>
                        )}
                      </td>
                      <td className="font-semibold text-[#1F2937]">
                        ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)} {request.asset}
                      </td>
                      <td>
                        <span className="badge-modern badge-primary">
                          {request.chain}
                        </span>
                      </td>
                      <td className="text-[#6B7280]">
                        <div className="text-sm font-medium">{new Date(request.createdAt).toLocaleDateString()}</div>
                        <div className="text-xs text-[#9CA3AF]">{request.creator.name}</div>
                      </td>
                      <td>
                        {canEdit ? (
                          <div className="flex items-center gap-3">
                            <Link
                              href={`/dashboard/requests/${request.id}/edit`}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 text-sm"
                            >
                              Edit & Submit
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </Link>
                            <button
                              onClick={() => handleDeleteDraft(request.id)}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-br from-red-500 to-red-700 text-white font-semibold rounded-full shadow-[0_8px_20px_-4px_rgba(239,68,68,0.4)] hover:shadow-[0_20px_40px_-10px_rgba(239,68,68,0.3)] transition-all hover:-translate-y-0.5 text-sm"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        ) : (
                          <Link
                            href={`/dashboard/requests/${request.id}`}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
                          >
                            View
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filters */}
      {otherRequests.length > 0 && (
        <div className="card-modern rounded-modern-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              <h4 className="font-bold text-[#1F2937]">Filters</h4>
            </div>
            
            <button
              onClick={exportToCSV}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 text-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export to CSV ({filteredRequests.length})
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="input-modern w-full"
              >
                <option value="">All Statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="APPROVED">Approved</option>
                <option value="READY_TO_RELEASE">Ready to Release</option>
                <option value="BROADCASTED">Broadcasted</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                Chain
              </label>
              <select
                value={filterChain}
                onChange={(e) => setFilterChain(e.target.value)}
                className="input-modern w-full"
              >
                <option value="">All Chains</option>
                {uniqueChains.map((chain) => (
                  <option key={chain} value={chain}>
                    {chain}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="input-modern w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="input-modern w-full"
              />
            </div>
          </div>

          {(filterStatus || filterChain || startDate || endDate) && (
            <div className="mt-4 flex items-center justify-between pt-4 border-t border-[#E5E7EB]">
              <p className="text-sm text-[#6B7280]">
                Showing <span className="font-semibold text-[#1F2937]">{filteredRequests.length}</span> of {otherRequests.length} requests
              </p>
              <button
                onClick={() => {
                  setFilterStatus('');
                  setFilterChain('');
                  setStartDate('');
                  setEndDate('');
                }}
                className="text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
              >
                Clear Filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* All Other Requests */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xl font-bold text-[#1F2937]">All Requests</h3>
          <span className="badge-modern badge-primary">
            {filteredRequests.length}
          </span>
        </div>

        {filteredRequests.length === 0 ? (
          <div className="card-modern p-12 text-center rounded-modern-lg">
            <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[#6B7280] mb-4">
              {otherRequests.length === 0 ? 'No submitted payment requests yet' : 'No requests match the selected filters'}
            </p>
            {canCreate && otherRequests.length === 0 && (
              <Link
                href="/dashboard/requests/new"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Request
              </Link>
            )}
          </div>
        ) : (
          <div className="card-modern rounded-modern-lg overflow-hidden">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Chain</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block group">
                        <div className="font-semibold text-[#1F2937] group-hover:text-[#1DBFA4] transition-colors">
                          {request.payee.name}
                        </div>
                        {request.memo && (
                          <div className="text-xs text-[#9CA3AF] mt-0.5">{request.memo}</div>
                        )}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block font-semibold text-[#1F2937]">
                        ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)} {request.asset}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block">
                        <span className="badge-modern badge-primary">
                          {request.chain}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block">
                        <span className={`badge-modern ${
                          request.status === 'CONFIRMED' ? 'badge-success' :
                          request.status === 'BROADCASTED' ? 'badge-info' :
                          request.status === 'READY_TO_RELEASE' ? 'badge-primary' :
                          request.status === 'SUBMITTED' ? 'badge-warning' :
                          request.status === 'REJECTED' ? 'badge-danger' :
                          'bg-[#F3F4F6] text-[#6B7280]'
                        }`}>
                          {request.status}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block text-[#6B7280]">
                        <div className="text-sm font-medium">{new Date(request.createdAt).toLocaleDateString()}</div>
                        <div className="text-xs text-[#9CA3AF]">{request.creator.name}</div>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
