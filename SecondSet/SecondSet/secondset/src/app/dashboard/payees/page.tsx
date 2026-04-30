'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface Payee {
  id: string;
  name: string;
  chain: string;
  address: string;
  contactEmail: string | null;
  notes: string | null;
  status: string;
  createdAt: Date;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  createdBy: string;
  creator: {
    name: string;
    email: string;
  };
  approver: {
    name: string;
    email: string;
  } | null;
}

interface PayeeAction {
  id: string;
  actionType: string;
  status: string;
  createdAt: Date;
  requestedBy: string;
  proposedChanges: any;
  payee: {
    id: string;
    name: string;
    address: string;
    chain: string;
  };
  requestedByUser: {
    name: string;
    email: string;
  };
}

export default function PayeesPage() {
  const router = useRouter();
  const [allPayees, setAllPayees] = useState<Payee[]>([]);
  const [pendingActions, setPendingActions] = useState<PayeeAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [canCreate, setCanCreate] = useState(false);
  const [isApprover, setIsApprover] = useState(false);
  const [userId, setUserId] = useState('');
  const [showRejected, setShowRejected] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [payeesRes, actionsRes] = await Promise.all([
        fetch('/api/payees'),
        fetch('/api/payee-actions'),
      ]);

      const payeesData = await payeesRes.json();
      const actionsData = await actionsRes.json();

      setAllPayees(payeesData.payees || []);
      setCanCreate(payeesData.canCreate || false);
      setIsApprover(payeesData.isApprover || false);
      setUserId(payeesData.userId || '');
      setPendingActions(actionsData.actions || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    // CSV headers
    const headers = [
      'Name',
      'Status',
      'Chain',
      'Address',
      'Contact Email',
      'Notes',
      'Created At',
      'Created By (Name)',
      'Created By (Email)',
      'Approved At',
      'Approved By (Name)',
      'Approved By (Email)',
      'Rejected At',
    ];

    // Convert payees to CSV rows
    const rows = allPayees.map((payee) => {
      return [
        payee.name,
        payee.status,
        payee.chain,
        payee.address,
        payee.contactEmail || '',
        payee.notes || '',
        new Date(payee.createdAt).toISOString(),
        payee.creator.name,
        payee.creator.email,
        payee.approvedAt ? new Date(payee.approvedAt).toISOString() : '',
        payee.approver?.name || '',
        payee.approver?.email || '',
        payee.rejectedAt ? new Date(payee.rejectedAt).toISOString() : '',
      ];
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(cell => {
          // Escape cells that contain commas, quotes, or newlines
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
    
    const filename = `payees_${new Date().toISOString().split('T')[0]}.csv`;
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApproveAction = async (actionId: string) => {
    const toastId = toast.loading('Approving action...');
    try {
      const response = await fetch(`/api/admin/payee-actions/${actionId}/approve`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to approve action');
      }

      toast.success('Action approved successfully!', { id: toastId });
      fetchData();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve action', { id: toastId });
    }
  };

  const handleRejectAction = async (actionId: string) => {
    const toastId = toast.loading('Rejecting action...');
    try {
      const response = await fetch(`/api/admin/payee-actions/${actionId}/reject`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to reject action');
      }

      toast.success('Action rejected successfully!', { id: toastId });
      fetchData();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject action', { id: toastId });
    }
  };

  // Separate payees by status
  const pendingPayees = allPayees.filter(p => p.status === 'PENDING');
  const approvedPayees = allPayees.filter(p => p.status === 'APPROVED');
  const rejectedPayees = allPayees.filter(p => p.status === 'REJECTED');

  if (loading) {
    return (
      <div className="fade-in">
        <div className="card-modern rounded-modern-lg p-12 text-center">
          <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-[#1DBFA4]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-[#6B7280]">Loading payees...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-3xl font-bold text-[#1F2937]">Payees</h2>
          <p className="text-[#6B7280] mt-1">Manage approved payment recipients</p>
        </div>
        <div className="flex items-center gap-3">
          {allPayees.length > 0 && (
            <button
              onClick={exportToCSV}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#1DBFA4] hover:text-[#1DBFA4] transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV ({allPayees.length})
            </button>
          )}
          {canCreate && (
            <Link
              href="/dashboard/payees/new"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Payee
            </Link>
          )}
        </div>
      </div>

      {/* Pending Payee Actions Section */}
      {isApprover && pendingActions.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xl font-bold text-[#1F2937]">Pending Payee Actions</h3>
            <span className="badge-modern badge-warning">
              {pendingActions.length}
            </span>
          </div>

          <div className="card-modern rounded-modern-lg overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Payee</th>
                  <th>Requested By</th>
                  <th>Requested At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingActions.map((action) => {
                  const canApprove = isApprover && action.requestedBy !== userId;
                  
                  return (
                    <tr key={action.id}>
                      <td>
                        <span className={`badge-modern ${
                          action.actionType === 'DELETE' ? 'badge-danger' : 'badge-info'
                        }`}>
                          {action.actionType}
                        </span>
                      </td>
                      <td>
                        <div className="font-semibold text-[#1F2937]">
                          {action.payee.name}
                        </div>
                        <div className="text-xs text-[#9CA3AF] font-mono">
                          {action.payee.address.slice(0, 10)}...{action.payee.address.slice(-8)}
                        </div>
                        {action.actionType === 'EDIT' && action.proposedChanges && (
                          <div className="text-xs text-[#6B7280] mt-1">
                            {action.proposedChanges.name && (
                              <div>New name: {action.proposedChanges.name}</div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="text-[#6B7280]">
                        {action.requestedByUser.name}
                      </td>
                      <td className="text-[#6B7280]">
                        {new Date(action.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        {canApprove ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApproveAction(action.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-[#10B981] text-white text-xs font-semibold rounded-full hover:bg-[#059669] transition-colors"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectAction(action.id)}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-[#EF4444] text-white text-xs font-semibold rounded-full hover:bg-[#DC2626] transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        ) : action.requestedBy === userId ? (
                          <span className="text-xs text-[#9CA3AF]">Awaiting approval</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Approvals Section */}
      {pendingPayees.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h3 className="text-xl font-bold text-[#1F2937]">Pending Approval</h3>
            <span className="badge-modern badge-warning">
              {pendingPayees.length}
            </span>
          </div>
          <div className="card-modern rounded-modern-lg overflow-hidden">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Chain</th>
                  <th>Address</th>
                  <th>Created By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayees.map((payee) => {
                  const canApprove = isApprover && payee.createdBy !== userId;
                  
                  return (
                    <tr key={payee.id}>
                      <td>
                        <div className="font-semibold text-[#1F2937]">
                          {payee.name}
                        </div>
                        {payee.notes && (
                          <div className="text-xs text-[#9CA3AF] mt-0.5">{payee.notes}</div>
                        )}
                      </td>
                      <td>
                        <span className="badge-modern badge-primary">
                          {payee.chain}
                        </span>
                      </td>
                      <td>
                        <div className="text-sm text-[#1F2937] font-mono">
                          {payee.address.slice(0, 10)}...{payee.address.slice(-8)}
                        </div>
                      </td>
                      <td className="text-[#6B7280]">
                        {payee.creator.name}
                      </td>
                      <td>
                        {canApprove ? (
                          <Link
                            href={`/dashboard/payees/${payee.id}/approve`}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
                          >
                            Review
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </Link>
                        ) : payee.createdBy === userId ? (
                          <span className="text-xs text-[#9CA3AF]">Awaiting approval</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Approved Payees Section */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-xl font-bold text-[#1F2937]">Approved Payees</h3>
          <span className="badge-modern badge-success">
            {approvedPayees.length}
          </span>
        </div>

        {approvedPayees.length === 0 ? (
          <div className="card-modern p-12 text-center rounded-modern-lg">
            <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-[#6B7280] mb-4">No approved payees yet</p>
            {canCreate && (
              <Link
                href="/dashboard/payees/new"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Your First Payee
              </Link>
            )}
          </div>
        ) : (
          <div className="card-modern rounded-modern-lg overflow-hidden">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Chain</th>
                  <th>Address</th>
                  <th>Contact</th>
                  <th>Approved By</th>
                </tr>
              </thead>
              <tbody>
                {approvedPayees.map((payee) => (
                  <tr key={payee.id}>
                    <td>
                      <div className="font-semibold text-[#1F2937]">
                        {payee.name}
                      </div>
                      {payee.notes && (
                        <div className="text-xs text-[#9CA3AF] mt-0.5">{payee.notes}</div>
                      )}
                    </td>
                    <td>
                      <span className="badge-modern badge-primary">
                        {payee.chain}
                      </span>
                    </td>
                    <td>
                      <div className="text-sm text-[#1F2937] font-mono">
                        {payee.address.slice(0, 10)}...{payee.address.slice(-8)}
                      </div>
                    </td>
                    <td className="text-[#6B7280]">
                      {payee.contactEmail || '-'}
                    </td>
                    <td className="text-[#6B7280]">
                      {payee.approver?.name || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rejected/Deleted Payees Section - Collapsible */}
      {rejectedPayees.length > 0 && (
        <div>
          <button
            onClick={() => setShowRejected(!showRejected)}
            className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity"
          >
            <svg 
              className={`w-5 h-5 text-[#6B7280] transition-transform ${showRejected ? 'rotate-90' : ''}`} 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-xl font-bold text-[#6B7280]">Deleted Payees</h3>
            <span className="badge-modern badge-danger">
              {rejectedPayees.length}
            </span>
          </button>
          
          {showRejected && (
            <div className="card-modern rounded-modern-lg overflow-hidden">
              <table className="table-modern">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Chain</th>
                    <th>Address</th>
                    <th>Created By</th>
                    <th>Deleted</th>
                  </tr>
                </thead>
                <tbody>
                  {rejectedPayees.map((payee) => (
                    <tr key={payee.id} className="opacity-60">
                      <td>
                        <div className="font-semibold text-[#6B7280]">
                          {payee.name}
                        </div>
                      </td>
                      <td>
                        <span className="badge-modern bg-[#F3F4F6] text-[#6B7280]">
                          {payee.chain}
                        </span>
                      </td>
                      <td>
                        <div className="text-sm text-[#9CA3AF] font-mono">
                          {payee.address.slice(0, 10)}...{payee.address.slice(-8)}
                        </div>
                      </td>
                      <td className="text-[#9CA3AF]">
                        {payee.creator.name}
                      </td>
                      <td className="text-[#9CA3AF]">
                        {payee.rejectedAt ? new Date(payee.rejectedAt).toLocaleDateString() : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
