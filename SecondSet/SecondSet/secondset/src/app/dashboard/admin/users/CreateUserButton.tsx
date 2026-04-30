'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function CreateUserButton() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    roles: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading('Creating user...');

    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create user');
      }

      // Success
      toast.success(`User ${formData.name} created successfully!`, { id: toastId });
      setShowModal(false);
      setFormData({ name: '', email: '', password: '', roles: [] });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const toggleRole = (role: string) => {
    if (formData.roles.includes(role)) {
      setFormData({
        ...formData,
        roles: formData.roles.filter((r) => r !== role),
      });
    } else {
      setFormData({
        ...formData,
        roles: [...formData.roles, role],
      });
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create User
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-slate-200 bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-modern rounded-modern-xl p-6 max-w-3xl w-full shadow-float">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#1F2937]">Create New User</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setFormData({ name: '', email: '', password: '', roles: [] });
                }}
                className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left: User Details */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                      Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="input-modern w-full"
                      placeholder="John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="input-modern w-full"
                      placeholder="john@acme.com"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                      Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="input-modern w-full"
                      placeholder="••••••••"
                    />
                  </div>

                  <div className="bg-gradient-to-br from-[#E0F2FE] to-[#F9FAFB] rounded-modern-lg p-4 mt-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#1F2937]">User Account Info</p>
                        <p className="text-xs text-[#6B7280] mt-1">
                          The user will receive these credentials to log in. Make sure to use a secure password.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Role Selection */}
                <div>
                  <label className="block text-sm font-semibold text-[#1F2937] mb-3">
                    Roles * (select at least one)
                  </label>
                  <div className="space-y-3">
                    {['INITIATOR', 'APPROVER', 'SIGNER', 'ADMIN'].map((role) => (
                      <label 
                        key={role} 
                        className={`flex items-start p-3 border-2 rounded-modern-lg cursor-pointer transition-all ${
                          formData.roles.includes(role)
                            ? 'border-[#1DBFA4] bg-[#E0F2FE]'
                            : 'border-[#E5E7EB] hover:border-[#1DBFA4] hover:bg-[#F9FAFB]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.roles.includes(role)}
                          onChange={() => toggleRole(role)}
                          className="mt-0.5 w-5 h-5 text-[#1DBFA4] focus:ring-[#1DBFA4] rounded border-[#D1D5DB]"
                        />
                        <div className="ml-3">
                          <span className="font-bold text-[#1F2937] block">{role}</span>
                          <p className="text-xs text-[#6B7280] mt-0.5">
                            {role === 'INITIATOR' && 'Can create and submit payment requests'}
                            {role === 'APPROVER' && 'Can approve submitted requests'}
                            {role === 'SIGNER' && 'Can release approved requests'}
                            {role === 'ADMIN' && 'Full administrative access'}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                  
                  {formData.roles.includes('INITIATOR') && formData.roles.includes('SIGNER') && (
                    <div className="mt-3 bg-yellow-50 border-l-4 border-yellow-500 p-3 rounded-modern-md">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div>
                          <p className="text-xs font-semibold text-yellow-800">Security Warning</p>
                          <p className="text-xs text-yellow-700 mt-0.5">
                            User cannot be both INITIATOR and SIGNER
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {formData.roles.length === 0 && (
                    <div className="mt-3 bg-red-50 border-l-4 border-red-500 p-3 rounded-modern-md">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div>
                          <p className="text-xs font-semibold text-red-800">No Roles Selected</p>
                          <p className="text-xs text-red-700 mt-0.5">
                            User must have at least one role
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-6 mt-6 border-t border-[#E5E7EB]">
                <button
                  type="submit"
                  disabled={loading || formData.roles.length === 0}
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
                      Create User
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setFormData({ name: '', email: '', password: '', roles: [] });
                  }}
                  className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#6B7280] transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}