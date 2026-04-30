import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import PayeeActionsButton from './PayeeActionsButton';

export default async function AdminPayeesPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;

  // Fetch all payees
  const allPayees = await prisma.payee.findMany({
    where: { orgId: user.orgId },
    include: {
      creator: {
        select: { name: true, email: true },
      },
      approver: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Fetch pending payee actions (edits/deletes)
  const pendingActions = await prisma.payeeAction.findMany({
    where: {
      orgId: user.orgId,
      status: 'PENDING',
    },
    include: {
      payee: true,
      requestedByUser: {
        select: { name: true, email: true },
      },
      approver: {
        select: { name: true, email: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const isApprover = user.roles?.includes('APPROVER');

  // Separate by status
  const activePayees = allPayees.filter(p => p.status === 'APPROVED');
  const pendingPayees = allPayees.filter(p => p.status === 'PENDING');
  const rejectedPayees = allPayees.filter(p => p.status === 'REJECTED');

  return (
    <div className="fade-in">
      {/* Header */}
      <div className="mb-8">
        <h3 className="text-xl font-bold text-[#1F2937]">Payee Management</h3>
        <p className="text-sm text-[#6B7280] mt-1">Edit or delete payees with approval workflow</p>
      </div>

      {/* Pending Actions Section */}
      {pendingActions.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h4 className="text-lg font-bold text-[#1F2937]">Pending Actions</h4>
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
                  const canApprove = isApprover && action.requestedBy !== user.id;
                  
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
                            <form action={`/api/admin/payee-actions/${action.id}/approve`} method="POST">
                              <button
                                type="submit"
                                className="inline-flex items-center gap-1 px-3 py-1 bg-[#10B981] text-white text-xs font-semibold rounded-full hover:bg-[#059669] transition-colors"
                              >
                                Approve
                              </button>
                            </form>
                            <form action={`/api/admin/payee-actions/${action.id}/reject`} method="POST">
                              <button
                                type="submit"
                                className="inline-flex items-center gap-1 px-3 py-1 bg-[#EF4444] text-white text-xs font-semibold rounded-full hover:bg-[#DC2626] transition-colors"
                              >
                                Reject
                              </button>
                            </form>
                          </div>
                        ) : action.requestedBy === user.id ? (
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

      {/* Active Payees */}
      <div className="mb-10">
        <div className="flex items-center gap-2 mb-4">
          <h4 className="text-lg font-bold text-[#1F2937]">Active Payees</h4>
          <span className="badge-modern badge-success">
            {activePayees.length}
          </span>
        </div>

        {activePayees.length === 0 ? (
          <div className="card-modern p-12 text-center rounded-modern-lg">
            <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-[#6B7280]">No active payees</p>
          </div>
        ) : (
          <div className="card-modern rounded-modern-lg overflow-x-auto">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Chain</th>
                  <th>Address</th>
                  <th>Contact</th>
                  <th>Approved By</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {activePayees.map((payee) => (
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
                        {payee.address}
                      </div>
                    </td>
                    <td className="text-[#6B7280]">
                      {payee.contactEmail || '-'}
                    </td>
                    <td className="text-[#6B7280]">
                      {payee.approver?.name || '-'}
                    </td>
                    <td>
                      <PayeeActionsButton payee={payee} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pending Approval Payees */}
      {pendingPayees.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <h4 className="text-lg font-bold text-[#6B7280]">Pending Approval</h4>
            <span className="badge-modern badge-warning">
              {pendingPayees.length}
            </span>
          </div>
          <div className="card-modern rounded-modern-lg overflow-x-auto opacity-75">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Chain</th>
                  <th>Address</th>
                  <th>Created By</th>
                </tr>
              </thead>
              <tbody>
                {pendingPayees.map((payee) => (
                  <tr key={payee.id}>
                    <td className="font-semibold text-[#6B7280]">{payee.name}</td>
                    <td>
                      <span className="badge-modern bg-[#F3F4F6] text-[#6B7280]">
                        {payee.chain}
                      </span>
                    </td>
                    <td className="text-sm text-[#9CA3AF] font-mono">
                      {payee.address.slice(0, 10)}...{payee.address.slice(-8)}
                    </td>
                    <td className="text-[#9CA3AF]">{payee.creator.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rejected Payees */}
      {rejectedPayees.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h4 className="text-lg font-bold text-[#6B7280]">Rejected</h4>
            <span className="badge-modern badge-danger">
              {rejectedPayees.length}
            </span>
          </div>
          <div className="card-modern rounded-modern-lg overflow-x-auto opacity-60">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Chain</th>
                  <th>Address</th>
                  <th>Rejected At</th>
                </tr>
              </thead>
              <tbody>
                {rejectedPayees.map((payee) => (
                  <tr key={payee.id}>
                    <td className="font-semibold text-[#6B7280]">{payee.name}</td>
                    <td>
                      <span className="badge-modern bg-[#F3F4F6] text-[#6B7280]">
                        {payee.chain}
                      </span>
                    </td>
                    <td className="text-sm text-[#9CA3AF] font-mono">
                      {payee.address.slice(0, 10)}...{payee.address.slice(-8)}
                    </td>
                    <td className="text-[#9CA3AF]">
                      {payee.rejectedAt ? new Date(payee.rejectedAt).toLocaleDateString() : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
