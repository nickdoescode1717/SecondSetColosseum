import { prisma } from '@/lib/db';
import { notFound } from 'next/navigation';
import AcceptInviteForm from './AcceptInviteForm';

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate invite server-side
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: {
      organization: { select: { name: true } },
    },
  });

  if (!invite) {
    notFound();
  }

  const isUsed = !!invite.usedAt;
  const isRevoked = !!invite.revokedAt;
  const isExpired = new Date() > invite.expiresAt;
  const isValid = !isUsed && !isRevoked && !isExpired;

  if (!isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F4F6F9] to-[#E0F2FE]">
        <div className="max-w-md w-full mx-4">
          <div className="card-modern rounded-modern-xl p-8 shadow-float text-center">
            <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-[#1F2937] mb-2">Invite Not Available</h1>
            <p className="text-[#6B7280] mb-6">
              {isUsed && 'This invite has already been used.'}
              {isRevoked && 'This invite has been revoked by an administrator.'}
              {isExpired && 'This invite has expired. Please ask your administrator for a new one.'}
            </p>
            <a
              href="/login"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all"
            >
              Go to Sign In
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      email={invite.email}
      orgName={invite.organization.name}
      roles={invite.roles}
    />
  );
}
