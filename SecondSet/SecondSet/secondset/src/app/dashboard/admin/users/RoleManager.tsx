'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface RoleManagerProps {
  userId: string;
  userName: string;
  userEmail: string;
  currentRoles: string[];
}

export default function RoleManager({ userId, userName, userEmail, currentRoles }: RoleManagerProps) {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(currentRoles);

  const handleSave = async () => {
    setLoading(true);

    const toastId = toast.loading('Updating roles...');

    try {
      const response = await fetch(`/api/admin/users/${userId}/roles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: selectedRoles }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update roles');
      }

      toast.success('Roles updated successfully!', { id: toastId });
      setShowModal(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update roles', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter((r) => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  return (
    <>
      <button
        onClick={() => {
          setSelectedRoles(currentRoles);
          setShowModal(true);
        }}
        className="inline-flex items-center gap-1 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
      >
        Edit Roles
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-slate-200 bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-modern rounded-modern-xl p-6 max-w-3xl w-full shadow-float">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#1F2937]">Manage User Roles</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedRoles(currentRoles);
                }}
                className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left: User Details */}
              <div className="md:col-span-1">
                <div className="bg-gradient-to-br from-[#E0F2FE] to-[#F9FAFB] rounded-modern-lg p-6">
                  <div className="text-center mb-4">
                    <div className="w-20 h-20 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3">
                      {userName?.charAt(0) || 'U'}
                    </div>
                    <h4 className="font-bold text-[#1F2937] text-lg mb-1">{userName}</h4>
                    <p className="text-sm text-[#6B7280] break-all">{userEmail}</p>
                  </div>
                  
                  <div className="pt-4 border-t border-[#E5E7EB]">
                    <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-2">Current Roles</p>
                    {currentRoles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {currentRoles.map((role) => (
                          <span key={role} className="badge-modern badge-primary text-xs">
                            {role}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[#9CA3AF]">No roles assigned</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Role Selection */}
              <div className="md:col-span-2">
                <p className="text-sm text-[#6B7280] mb-4">Select the roles you want to assign to this user</p>
                
                <div className="space-y-3 mb-6">
                  {['INITIATOR', 'APPROVER', 'SIGNER', 'ADMIN'].map((role) => (
                    <label 
                      key={role} 
                      className={`flex items-start p-4 border-2 rounded-modern-lg cursor-pointer transition-all ${
                        selectedRoles.includes(role)
                          ? 'border-[#1DBFA4] bg-[#E0F2FE]'
                          : 'border-[#E5E7EB] hover:border-[#1DBFA4] hover:bg-[#F9FAFB]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={() => toggleRole(role)}
                        className="mt-1 w-5 h-5 text-[#1DBFA4] focus:ring-[#1DBFA4] rounded border-[#D1D5DB]"
                      />
                      <div className="ml-3 flex-1">
                        <span className="font-bold text-[#1F2937] block mb-1">{role}</span>
                        <p className="text-xs text-[#6B7280]">
                          {role === 'INITIATOR' && 'Can create and submit payment requests'}
                          {role === 'APPROVER' && 'Can approve submitted requests'}
                          {role === 'SIGNER' && 'Can release approved requests'}
                          {role === 'ADMIN' && 'Full administrative access'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>

                {selectedRoles.includes('INITIATOR') && selectedRoles.includes('SIGNER') && (
                  <div className="mb-4 bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-modern-md">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-yellow-800">Security Warning</p>
                        <p className="text-xs text-yellow-700 mt-1">
                          User cannot be both INITIATOR and SIGNER for security reasons
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedRoles.length === 0 && (
                  <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-modern-md">
                    <div className="flex items-start gap-3">
                      <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-semibold text-red-800">No Roles Selected</p>
                        <p className="text-xs text-red-700 mt-1">
                          User must have at least one role
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-[#E5E7EB]">
                  <button
                    onClick={handleSave}
                    disabled={loading || selectedRoles.length === 0}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
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
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Save Changes
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowModal(false);
                      setSelectedRoles(currentRoles);
                    }}
                    className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#6B7280] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}