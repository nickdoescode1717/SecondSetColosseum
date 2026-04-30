import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import CreateUserButton from './CreateUserButton';
import RoleManager from './RoleManager';
import InviteUserButton from './InviteUserButton';
import PendingInvites from './PendingInvites';

export default async function UsersManagementPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;

  const [users, pendingInvites] = await Promise.all([
    prisma.user.findMany({
      where: { orgId: user.orgId },
      include: {
        roleAssignments: {
          select: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.invite.findMany({
      where: {
        orgId: user.orgId,
        usedAt: null,
        revokedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        creator: { select: { name: true, email: true } },
      },
    }),
  ]);

  // Serialize dates for client component
  const serializedInvites = pendingInvites.map((inv) => ({
    id: inv.id,
    email: inv.email,
    roles: inv.roles,
    token: inv.token,
    expiresAt: inv.expiresAt.toISOString(),
    createdAt: inv.createdAt.toISOString(),
    creator: inv.creator,
  }));

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-[#1F2937]">User Management</h3>
          <p className="text-sm text-[#6B7280] mt-1">{users.length} total users</p>
        </div>
        <div className="flex gap-3">
          <InviteUserButton />
          <CreateUserButton />
        </div>
      </div>

      <div className="card-modern rounded-modern-lg overflow-hidden">
        <table className="table-modern">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Roles</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold">
                      {u.name?.charAt(0) || 'U'}
                    </div>
                    <div className="font-semibold text-[#1F2937]">{u.name}</div>
                  </div>
                </td>
                <td>
                  <div className="text-[#6B7280]">{u.email}</div>
                </td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    {u.roleAssignments.map((ra) => (
                      <span
                        key={ra.role}
                        className="badge-modern badge-primary"
                      >
                        {ra.role}
                      </span>
                    ))}
                    {u.roleAssignments.length === 0 && (
                      <span className="badge-modern bg-[#F3F4F6] text-[#9CA3AF]">
                        No roles
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-[#6B7280]">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td>
                  <RoleManager
                    userId={u.id}
                    userName={u.name}
                    userEmail={u.email}
                    currentRoles={u.roleAssignments.map((ra) => ra.role)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PendingInvites invites={serializedInvites} />
    </div>
  );
}