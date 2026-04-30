'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

interface Invite {
  id: string;
  email: string;
  roles: string[];
  token: string;
  expiresAt: string;
  createdAt: string;
  creator: { name: string | null; email: string };
}

export default function PendingInvites({ invites }: { invites: Invite[] }) {
  const router = useRouter();
  const [revoking, setRevoking] = useState<string | null>(null);

  if (invites.length === 0) return null;

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    const toastId = toast.loading('Revoking invite...');

    try {
      const response = await fetch(`/api/admin/invites/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to revoke invite');
      }

      toast.success('Invite revoked', { id: toastId });
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to revoke invite', { id: toastId });
    } finally {
      setRevoking(null);
    }
  };

  const handleCopyLink = async (inviteToken: string) => {
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/invite/${inviteToken}`;
    try {
      await navigator.clipboard.writeText(link);
      toast.success('Invite link copied');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <div className="mt-8">
      <h3 className="text-lg font-bold text-[#1F2937] mb-4">
        Pending Invites ({invites.length})
      </h3>
      <div className="card-modern rounded-modern-lg overflow-hidden">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Email</th>
              <th>Roles</th>
              <th>Expires</th>
              <th>Invited By</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invites.map((invite) => {
              const isExpired = new Date(invite.expiresAt) < new Date();
              return (
                <tr key={invite.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center">
                        <svg className="w-5 h-5 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="text-[#6B7280]">{invite.email}</div>
                    </div>
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {invite.roles.map((role) => (
                        <span key={role} className="badge-modern badge-primary">
                          {role}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="text-[#6B7280]">
                    {isExpired ? (
                      <span className="text-red-500 font-semibold">Expired</span>
                    ) : (
                      new Date(invite.expiresAt).toLocaleDateString()
                    )}
                  </td>
                  <td className="text-[#6B7280]">
                    {invite.creator.name || invite.creator.email}
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCopyLink(invite.token)}
                        className="text-[#1DBFA4] hover:text-[#117362] text-sm font-semibold transition-colors"
                        title="Copy invite link"
                      >
                        Copy Link
                      </button>
                      <button
                        onClick={() => handleRevoke(invite.id)}
                        disabled={revoking === invite.id}
                        className="text-red-500 hover:text-red-700 text-sm font-semibold transition-colors disabled:opacity-50"
                      >
                        {revoking === invite.id ? 'Revoking...' : 'Revoke'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
