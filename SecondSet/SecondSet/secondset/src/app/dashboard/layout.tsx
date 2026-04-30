import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import SignOutButton from './SignOutButton';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  const user = session.user as any;

  const isAdmin = user.roles?.includes('ADMIN');
  const isApprover = user.roles?.includes('APPROVER');
  const isSigner = user.roles?.includes('SIGNER');
  const isInitiator = user.roles?.includes('INITIATOR');

  return (
    <div className="flex h-screen bg-[#F4F6F9] overflow-hidden">
      {/* Modern Sidebar */}
      <aside className="w-64 bg-white border-r border-[#E5E7EB] flex flex-col">
        {/* Logo Section */}
        <div className="p-6 border-b border-[#E5E7EB]">
          <Link href="/dashboard" className="flex items-center gap-3">
            <Image
              src="/Logo.png"
              alt="SecondSet Logo"
              width={100}
              height={40}
              className="object-contain"
            />
            <span className="text-xl font-bold text-[#2D527B]">
              SecondSet
            </span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 overflow-y-auto">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#E0F2FE] hover:text-[#1DBFA4] transition-all mb-1"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="3" width="7" height="7" rx="1"></rect>
              <rect x="14" y="14" width="7" height="7" rx="1"></rect>
              <rect x="3" y="14" width="7" height="7" rx="1"></rect>
            </svg>
            Dashboard
          </Link>

          {isInitiator && (
            <Link
              href="/dashboard/requests/new"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#E0F2FE] hover:text-[#1DBFA4] transition-all mb-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              New Request
            </Link>
          )}

          <Link
            href="/dashboard/requests"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#E0F2FE] hover:text-[#1DBFA4] transition-all mb-1"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            Requests
          </Link>

          <Link
            href="/dashboard/swaps"
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#E0F2FE] hover:text-[#1DBFA4] transition-all mb-1"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 16V4m0 0L3 8m4-4l4 4"></path>
              <path d="M17 8v12m0 0l4-4m-4 4l-4-4"></path>
            </svg>
            Swaps
          </Link>

          {isApprover && (
            <Link
              href="/dashboard/approvals"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#E0F2FE] hover:text-[#1DBFA4] transition-all mb-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 11 12 14 22 4"></polyline>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
              Approvals
            </Link>
          )}

          {(isInitiator || isAdmin || isApprover) && (
            <Link
              href="/dashboard/payees"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#E0F2FE] hover:text-[#1DBFA4] transition-all mb-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                <circle cx="9" cy="7" r="4"></circle>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
              </svg>
              Payees
            </Link>
          )}

          {isSigner && (
            <Link
              href="/dashboard/releases"
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#E0F2FE] hover:text-[#1DBFA4] transition-all mb-1"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Releases
            </Link>
          )}

          {isAdmin && (
            <>
              <div className="my-4 border-t border-[#E5E7EB]"></div>
              <Link
                href="/dashboard/admin"
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-[#E0F2FE] hover:text-[#1DBFA4] transition-all mb-1"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
                Admin Panel
              </Link>
            </>
          )}
        </nav>

        {/* User Profile Section */}
        <div className="p-4 border-t border-[#E5E7EB]">
          <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-[#F9FAFB] transition-all mb-2">
            <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-sm">
              {user.name?.charAt(0) || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-[#1F2937] truncate">{user.name}</div>
              <div className="flex gap-1 mt-1 flex-wrap">
                {user.roles?.slice(0, 2).map((role: string) => (
                  <span
                    key={role}
                    className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{
                      background: 'rgba(29, 191, 164, 0.1)',
                      color: '#117362',
                    }}
                  >
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-8 max-w-7xl mx-auto">
          <div className="fade-in">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}