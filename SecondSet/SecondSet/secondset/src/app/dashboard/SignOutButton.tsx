'use client';

export default function SignOutButton() {
  return (
    <form action="/api/auth/signout" method="POST">
      <button
        type="submit"
        className="text-sm font-semibold px-4 py-2 rounded-lg transition-all text-[#6B7280] hover:text-[#DC2626] hover:bg-[#FEE2E2]"
      >
        Sign Out
      </button>
    </form>
  );
}