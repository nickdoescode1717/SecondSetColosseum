'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface Payee {
  id: string;
  name: string;
  chain: string;
  address: string;
  contactEmail: string | null;
  notes: string | null;
}

export default function PayeeActionsButton({ payee }: { payee: Payee }) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [editData, setEditData] = useState({
    name: payee.name,
    contactEmail: payee.contactEmail || '',
    notes: payee.notes || '',
  });

  const handleEdit = async () => {
    setLoading(true);
    const toastId = toast.loading('Requesting edit approval...');

    try {
      const response = await fetch('/api/admin/payee-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeeId: payee.id,
          actionType: 'EDIT',
          proposedChanges: editData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request edit');
      }

      toast.success('Edit request submitted for approval!', { id: toastId });
      setShowEditModal(false);
      setShowMenu(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to request edit', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    const toastId = toast.loading('Requesting delete approval...');

    try {
      const response = await fetch('/api/admin/payee-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payeeId: payee.id,
          actionType: 'DELETE',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to request delete');
      }

      toast.success('Delete request submitted for approval!', { id: toastId });
      setShowDeleteModal(false);
      setShowMenu(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to request delete', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold text-[#6B7280] hover:text-[#1DBFA4] transition-colors"
        >
          Actions
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showMenu && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setShowMenu(false)}
            />
            {/* Dropdown */}
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-[#E5E7EB] py-1 z-20">
              <button
                onClick={() => {
                  setShowEditModal(true);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-[#1F2937] hover:bg-[#F9FAFB] flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit Payee
              </button>
              <button
                onClick={() => {
                  setShowDeleteModal(true);
                  setShowMenu(false);
                }}
                className="w-full text-left px-4 py-2 text-sm text-[#EF4444] hover:bg-[#FEF2F2] flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Payee
              </button>
            </div>
          </>
        )}
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-200 bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-modern rounded-modern-xl p-6 max-w-md w-full shadow-float">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#1F2937]">Edit Payee</h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-modern-md mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-yellow-800">Requires Approval</p>
                  <p className="text-xs text-yellow-700 mt-1">
                    Changes require approval from another user with APPROVER role
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  className="input-modern w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={editData.contactEmail}
                  onChange={(e) => setEditData({ ...editData, contactEmail: e.target.value })}
                  className="input-modern w-full"
                  placeholder="contact@example.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Notes
                </label>
                <textarea
                  value={editData.notes}
                  onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                  className="input-modern w-full"
                  rows={3}
                  placeholder="Optional notes..."
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleEdit}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {loading ? 'Requesting...' : 'Request Edit'}
              </button>
              <button
                onClick={() => setShowEditModal(false)}
                className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#6B7280] transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-200 bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-modern rounded-modern-xl p-6 max-w-md w-full shadow-float">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#1F2937]">Delete Payee</h3>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-modern-md mb-6">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="text-sm font-semibold text-red-800">Warning</p>
                  <p className="text-xs text-red-700 mt-1">
                    This action requires approval. Once approved, the payee will be permanently deleted.
                  </p>
                </div>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-sm text-[#6B7280] mb-2">You are about to request deletion of:</p>
              <div className="bg-[#F9FAFB] rounded-lg p-4">
                <p className="font-semibold text-[#1F2937]">{payee.name}</p>
                <p className="text-xs text-[#6B7280] font-mono mt-1">{payee.address}</p>
                <span className="badge-modern badge-primary mt-2 inline-block">{payee.chain}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#EF4444] text-white font-semibold rounded-full hover:bg-[#DC2626] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Requesting...' : 'Request Delete'}
              </button>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#6B7280] transition-all"
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
