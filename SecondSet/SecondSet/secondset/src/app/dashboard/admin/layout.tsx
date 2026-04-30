import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  
  if (!session) {
    redirect('/login');
  }

  const user = session.user as any;

  // Check if user is an ADMIN
  if (!user.roles?.includes('ADMIN')) {
    redirect('/dashboard');
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[#1F2937]">Admin Panel</h2>
            <p className="text-sm text-[#6B7280]">Manage users, vaults, and organization settings</p>
          </div>
        </div>
      </div>

      {/* Admin Navigation */}
      <div className="border-b border-[#E5E7EB] mb-8">
        <nav className="flex space-x-8">
          <Link
            href="/dashboard/admin"
            className="border-b-2 border-transparent hover:border-[#1DBFA4] py-4 px-1 text-sm font-semibold text-[#6B7280] hover:text-[#1DBFA4] transition-all"
          >
            Overview
          </Link>
          <Link
            href="/dashboard/admin/users"
            className="border-b-2 border-transparent hover:border-[#1DBFA4] py-4 px-1 text-sm font-semibold text-[#6B7280] hover:text-[#1DBFA4] transition-all"
          >
            Users
          </Link>
          <Link
            href="/dashboard/admin/vaults"
            className="border-b-2 border-transparent hover:border-[#1DBFA4] py-4 px-1 text-sm font-semibold text-[#6B7280] hover:text-[#1DBFA4] transition-all"
          >
            Vaults
          </Link>
          <Link
            href="/dashboard/admin/payees"
            className="border-b-2 border-transparent hover:border-[#1DBFA4] py-4 px-1 text-sm font-semibold text-[#6B7280] hover:text-[#1DBFA4] transition-all"
          >
            Payees
          </Link>
          <Link
            href="/dashboard/admin/audit"
            className="border-b-2 border-transparent hover:border-[#1DBFA4] py-4 px-1 text-sm font-semibold text-[#6B7280] hover:text-[#1DBFA4] transition-all"
          >
            Audit Log
          </Link>
        </nav>
      </div>

      {children}
    </div>
  );
}
