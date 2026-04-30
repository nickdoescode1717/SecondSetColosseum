'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function InviteUserButton() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);

  const [formData, setFormData] = useState({
    email: '',
    roles: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading('Creating invite...');

    try {
      const response = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create invite');
      }

      toast.success(`Invite created for ${formData.email}`, { id: toastId });
      setInviteLink(data.invite.link);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create invite', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setFormData({ email: '', roles: [] });
    setInviteLink('');
    setCopied(false);
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
        className="inline-flex items-center gap-2 px-6 py-3 bg-white border-2 border-[#1DBFA4] text-[#1DBFA4] font-semibold rounded-full hover:bg-[#E0F2FE] transition-all hover:-translate-y-0.5"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        Invite User
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-slate-200 bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="card-modern rounded-modern-xl p-6 max-w-3xl w-full shadow-float">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-[#1F2937]">
                {inviteLink ? 'Invite Created' : 'Invite User'}
              </h3>
              <button
                onClick={handleClose}
                className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {inviteLink ? (
              /* Success: Show invite link */
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-[#E0F2FE] to-[#F9FAFB] rounded-modern-lg p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1F2937]">Invite sent to {formData.email}</p>
                      <p className="text-xs text-[#6B7280] mt-1">
                        Share the link below with the invited user. The link expires in 7 days.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink}
                    className="input-modern flex-1 bg-[#F9FAFB] text-[#6B7280] text-sm font-mono"
                  />
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white font-semibold rounded-modern-lg hover:shadow-float transition-all"
                  >
                    {copied ? (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Copied
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        Copy Link
                      </>
                    )}
                  </button>
                </div>

                <div className="flex justify-end pt-4 mt-4 border-t border-[#E5E7EB]">
                  <button
                    onClick={handleClose}
                    className="inline-flex items-center justify-center px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Form: Email + role selection */
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left: Email */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#1F2937] mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        className="input-modern w-full"
                        placeholder="newuser@acme.com"
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
                          <p className="text-sm font-semibold text-[#1F2937]">How Invites Work</p>
                          <p className="text-xs text-[#6B7280] mt-1">
                            A secure invite link will be generated. Share it with the user
                            so they can set their own password and join your organization.
                            The link expires in 7 days.
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
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        Create Invite
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#6B7280] transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
