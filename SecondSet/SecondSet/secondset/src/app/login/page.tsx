'use client';

import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError('Invalid email or password');
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#F4F6F9] to-[#E0F2FE]">
      <div className="max-w-md w-full mx-4">
        {/* Login Card */}
        <div className="card-modern rounded-modern-xl p-8 shadow-float">
          {/* Logo Section */}
          <div className="flex flex-col items-center mb-8">
            <div className="mb-6">
              <Image
                src="/Logo.png"
                alt="SecondSet Logo"
                width={200}
                height={80}
                className="object-contain"
              />
            </div>
            <h1 className="text-3xl font-bold text-[#1F2937] mb-2">Welcome to SecondSet</h1>
            <p className="text-center text-sm text-[#6B7280] max-w-sm">
              Self-custodied stablecoin treasury controls for teams
            </p>
          </div>
          
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-modern-md">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            )}
            
            <div>
              <label htmlFor="email" className="block text-sm font-semibold text-[#1F2937] mb-2">
                Email Address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-modern w-full"
                placeholder="alice@acme.com"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-semibold text-[#1F2937] mb-2">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-modern w-full"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        {/* Sign up link */}
        <div className="mt-6 text-center">
          <p className="text-sm text-[#6B7280]">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="font-semibold text-[#1DBFA4] hover:text-[#117362] transition-colors">
              Sign up
            </Link>
          </p>
        </div>

        {/* Test Accounts Card */}
        <div className="mt-6 card-modern rounded-modern-lg p-6 shadow-card">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-[#1F2937] mb-1">Test Accounts</p>
              <p className="text-xs text-[#6B7280] mb-3">Use these credentials to explore different roles</p>
            </div>
          </div>
          
          <div className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-2 px-3 bg-[#F9FAFB] rounded-lg">
              <span className="text-[#1F2937] font-mono">alice@acme.com</span>
              <span className="badge-modern text-[10px] px-2 py-0.5" style={{ background: 'rgba(29, 191, 164, 0.1)', color: '#117362' }}>INITIATOR</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-[#F9FAFB] rounded-lg">
              <span className="text-[#1F2937] font-mono">bob@acme.com</span>
              <span className="badge-modern text-[10px] px-2 py-0.5" style={{ background: 'rgba(29, 191, 164, 0.1)', color: '#117362' }}>APPROVER</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-[#F9FAFB] rounded-lg">
              <span className="text-[#1F2937] font-mono">charlie@acme.com</span>
              <span className="badge-modern text-[10px] px-2 py-0.5" style={{ background: 'rgba(29, 191, 164, 0.1)', color: '#117362' }}>SIGNER</span>
            </div>
            <div className="flex items-center justify-between py-2 px-3 bg-[#F9FAFB] rounded-lg">
              <span className="text-[#1F2937] font-mono">admin@acme.com</span>
              <span className="badge-modern text-[10px] px-2 py-0.5" style={{ background: 'rgba(29, 191, 164, 0.1)', color: '#117362' }}>ADMIN</span>
            </div>
          </div>
          
          <div className="mt-4 pt-4 border-t border-[#E5E7EB]">
            <p className="text-xs text-[#6B7280]">
              <span className="font-semibold text-[#1F2937]">Password for all:</span> password123
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-[#9CA3AF] mt-6">
          Secured by multi-party controls and blockchain technology
        </p>
      </div>
    </div>
  );
}