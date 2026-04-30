'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { formatUnits, parseUnits } from 'viem';

interface Vault {
  id: string;
  name: string | null;
  chain: string;
  chainName: string | null;
  address: string;
}

const SWAPPABLE_TOKENS = [
  { value: 'USDC', label: 'USDC', symbol: '$', decimals: 6 },
  { value: 'USDT', label: 'USDT', symbol: '$', decimals: 6 },
  { value: 'EURC', label: 'EURC', symbol: '€', decimals: 6 },
];

const SLIPPAGE_OPTIONS = [
  { value: 10, label: '0.1%' },
  { value: 30, label: '0.3%' },
  { value: 50, label: '0.5%' },
  { value: 100, label: '1.0%' },
];

// Chains that support Uniswap swaps
const SWAP_SUPPORTED_CHAINS = ['ethereum', 'sepolia', 'base'];

const resolveVaultChain = (address: string): 'EVM' | 'SOLANA' => {
  return address.startsWith('0x') ? 'EVM' : 'SOLANA';
};

interface QuoteResult {
  amountOut: string;
  amountOutMin: string;
  priceImpact: string | null;
  gasEstimate: string | null;
  route: string | null;
  expiresAt: string | null;
}

export default function NewSwapPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    vaultId: '',
    fromToken: 'USDC',
    toToken: 'USDT',
    amount: '',
    slippageBps: 50,
    memo: '',
  });

  useEffect(() => {
    fetchVaults();
  }, []);

  const fetchVaults = async () => {
    try {
      const response = await fetch('/api/vaults');
      if (response.ok) {
        const data = await response.json();
        // Filter to EVM vaults on swap-supported chains only
        const evmVaults = (data.vaults || []).filter((v: Vault) => {
          if (resolveVaultChain(v.address) !== 'EVM') return false;
          const chainName = v.chainName || 'ethereum';
          return SWAP_SUPPORTED_CHAINS.includes(chainName);
        });
        setVaults(evmVaults);
      } else {
        console.error('Failed to fetch vaults, status:', response.status);
        toast.error('Failed to load vaults');
      }
    } catch (err) {
      console.error('Error fetching vaults:', err);
      toast.error('Failed to load vaults');
    }
  };

  // Available "to" tokens = all swappable tokens except fromToken
  const availableToTokens = SWAPPABLE_TOKENS.filter(t => t.value !== formData.fromToken);

  // When fromToken changes, make sure toToken isn't the same
  useEffect(() => {
    if (formData.fromToken === formData.toToken) {
      const firstAvailable = SWAPPABLE_TOKENS.find(t => t.value !== formData.fromToken);
      if (firstAvailable) {
        setFormData(prev => ({ ...prev, toToken: firstAvailable.value }));
      }
    }
  }, [formData.fromToken]);

  // Clear quote when key fields change
  useEffect(() => {
    setQuote(null);
    setQuoteError(null);
  }, [formData.vaultId, formData.fromToken, formData.toToken, formData.amount, formData.slippageBps]);

  const selectedVault = vaults.find(v => v.id === formData.vaultId);
  const fromTokenConfig = SWAPPABLE_TOKENS.find(t => t.value === formData.fromToken);
  const toTokenConfig = SWAPPABLE_TOKENS.find(t => t.value === formData.toToken);

  const fetchQuote = useCallback(async () => {
    if (!formData.vaultId || !formData.amount || !formData.fromToken || !formData.toToken) return;

    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || amount <= 0) return;

    setQuoteLoading(true);
    setQuoteError(null);

    try {
      const decimals = fromTokenConfig?.decimals || 6;
      const fromAmountMinor = parseUnits(formData.amount, decimals).toString();

      const response = await fetch('/api/swaps/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId: formData.vaultId,
          fromToken: formData.fromToken,
          toToken: formData.toToken,
          fromAmount: fromAmountMinor,
          slippageBps: formData.slippageBps,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get quote');
      }

      setQuote(data.quote);
    } catch (err: any) {
      setQuoteError(err.message);
    } finally {
      setQuoteLoading(false);
    }
  }, [formData.vaultId, formData.amount, formData.fromToken, formData.toToken, formData.slippageBps, fromTokenConfig]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading('Creating swap request...');

    try {
      const decimals = fromTokenConfig?.decimals || 6;
      const fromAmountMinor = parseUnits(formData.amount, decimals).toString();

      const response = await fetch('/api/swaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vaultId: formData.vaultId,
          fromToken: formData.fromToken,
          toToken: formData.toToken,
          fromAmount: fromAmountMinor,
          slippageBps: formData.slippageBps,
          memo: formData.memo || undefined,
          quote: quote ? {
            amountOut: quote.amountOut,
            amountOutMin: quote.amountOutMin,
            priceImpact: quote.priceImpact,
            route: quote.route,
            expiresAt: quote.expiresAt,
          } : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create swap request');
      }

      toast.success('Swap request created successfully!', { id: toastId });
      setTimeout(() => {
        router.push(`/dashboard/swaps/${data.id}`);
        router.refresh();
      }, 500);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create swap request', { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/swaps"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors mb-4"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Swaps
        </Link>
        <h2 className="text-3xl font-bold text-[#1F2937]">New Stablecoin Swap</h2>
        <p className="text-[#6B7280] mt-2">Swap between stablecoins via Uniswap</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2">
          <div className="card-modern rounded-modern-lg p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Vault Selection */}
              <div>
                <label htmlFor="vault" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  From Vault (EVM Only) *
                </label>
                <select
                  id="vault"
                  required
                  value={formData.vaultId}
                  onChange={(e) => setFormData({ ...formData, vaultId: e.target.value })}
                  className="input-modern w-full"
                >
                  <option value="">Select a vault</option>
                  {vaults.map((vault) => (
                    <option key={vault.id} value={vault.id}>
                      {vault.name || 'Unnamed Vault'} ({vault.chainName || 'ethereum'}) - {vault.address.slice(0, 10)}...
                    </option>
                  ))}
                </select>
                {vaults.length === 0 && (
                  <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    No EVM vaults available on swap-supported chains.
                  </p>
                )}
              </div>

              {/* From Token */}
              <div>
                <label className="block text-sm font-semibold text-[#1F2937] mb-2">From Token *</label>
                <div className="grid grid-cols-3 gap-3">
                  {SWAPPABLE_TOKENS.map((token) => (
                    <button
                      key={token.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, fromToken: token.value })}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        formData.fromToken === token.value
                          ? 'border-[#1DBFA4] bg-[#E0F2FE]'
                          : 'border-[#E5E7EB] bg-white hover:border-[#1DBFA4]'
                      }`}
                    >
                      <div className="text-3xl font-bold mb-1 text-[#1F2937]">{token.symbol}</div>
                      <div className="text-sm font-semibold text-[#1F2937]">{token.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Swap Arrow */}
              <div className="flex justify-center">
                <div className="w-10 h-10 rounded-full bg-[#E0F2FE] flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#1DBFA4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4"></path>
                    <path d="M17 8v12m0 0l4-4m-4 4l-4-4"></path>
                  </svg>
                </div>
              </div>

              {/* To Token */}
              <div>
                <label className="block text-sm font-semibold text-[#1F2937] mb-2">To Token *</label>
                <div className="grid grid-cols-3 gap-3">
                  {SWAPPABLE_TOKENS.map((token) => {
                    const isDisabled = token.value === formData.fromToken;
                    return (
                      <button
                        key={token.value}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => setFormData({ ...formData, toToken: token.value })}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          isDisabled
                            ? 'border-[#E5E7EB] bg-[#F9FAFB] opacity-40 cursor-not-allowed'
                            : formData.toToken === token.value
                            ? 'border-[#1DBFA4] bg-[#E0F2FE]'
                            : 'border-[#E5E7EB] bg-white hover:border-[#1DBFA4]'
                        }`}
                      >
                        <div className="text-3xl font-bold mb-1 text-[#1F2937]">{token.symbol}</div>
                        <div className="text-sm font-semibold text-[#1F2937]">{token.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount */}
              <div>
                <label htmlFor="amount" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Amount ({formData.fromToken}) *
                </label>
                <input
                  id="amount"
                  type="number"
                  step={fromTokenConfig?.decimals === 18 ? '0.000000000000000001' : '0.000001'}
                  min="0"
                  required
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="input-modern w-full"
                />
                <p className="mt-2 text-xs text-[#6B7280]">
                  Enter amount in {formData.fromToken} (e.g., 1000.00)
                </p>
              </div>

              {/* Slippage */}
              <div>
                <label className="block text-sm font-semibold text-[#1F2937] mb-2">Slippage Tolerance</label>
                <div className="grid grid-cols-4 gap-2">
                  {SLIPPAGE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, slippageBps: opt.value })}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border-2 transition-all ${
                        formData.slippageBps === opt.value
                          ? 'border-[#1DBFA4] bg-[#E0F2FE] text-[#1DBFA4]'
                          : 'border-[#E5E7EB] bg-white text-[#6B7280] hover:border-[#1DBFA4]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Get Quote Button */}
              <div>
                <button
                  type="button"
                  disabled={!formData.vaultId || !formData.amount || quoteLoading}
                  onClick={fetchQuote}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-[#1DBFA4] text-[#1DBFA4] font-semibold rounded-full hover:bg-[#E0F2FE] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {quoteLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Getting Quote...
                    </>
                  ) : (
                    'Get Indicative Quote'
                  )}
                </button>
              </div>

              {/* Quote Display */}
              {quote && toTokenConfig && (
                <div className="bg-[#F0FDF9] border border-[#A7F3D0] rounded-xl p-4">
                  <h4 className="text-sm font-bold text-[#1F2937] mb-3">Quote Preview</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280]">Expected Output</span>
                      <span className="font-semibold text-[#1F2937]">
                        {formatUnits(BigInt(quote.amountOut || '0'), toTokenConfig.decimals)} {formData.toToken}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-[#6B7280]">Minimum Output</span>
                      <span className="font-medium text-[#6B7280]">
                        {formatUnits(BigInt(quote.amountOutMin || '0'), toTokenConfig.decimals)} {formData.toToken}
                      </span>
                    </div>
                    {quote.priceImpact && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#6B7280]">Price Impact</span>
                        <span className="font-medium text-[#6B7280]">{quote.priceImpact}%</span>
                      </div>
                    )}
                    {quote.gasEstimate && (
                      <div className="flex justify-between text-sm">
                        <span className="text-[#6B7280]">Est. Gas</span>
                        <span className="font-medium text-[#6B7280]">{quote.gasEstimate}</span>
                      </div>
                    )}
                  </div>
                  <p className="mt-3 text-xs text-[#9CA3AF]">
                    This is an indicative quote. Final rate determined at release time.
                  </p>
                </div>
              )}

              {quoteError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-sm text-red-700">{quoteError}</p>
                </div>
              )}

              {/* Memo */}
              <div>
                <label htmlFor="memo" className="block text-sm font-semibold text-[#1F2937] mb-2">
                  Memo / Description
                </label>
                <textarea
                  id="memo"
                  rows={3}
                  placeholder="Reason for swap, rebalancing stablecoin holdings..."
                  value={formData.memo}
                  onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
                  className="input-modern w-full resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-[#E5E7EB]">
                <button
                  type="submit"
                  disabled={loading || vaults.length === 0}
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
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4"></path>
                        <path d="M17 8v12m0 0l4-4m-4 4l-4-4"></path>
                      </svg>
                      Create Swap Request
                    </>
                  )}
                </button>
                <Link
                  href="/dashboard/swaps"
                  className="flex-1 inline-flex items-center justify-center px-6 py-3 bg-white border-2 border-[#E5E7EB] text-[#6B7280] font-semibold rounded-full hover:border-[#1DBFA4] hover:text-[#1DBFA4] transition-all"
                >
                  Cancel
                </Link>
              </div>
            </form>
          </div>
        </div>

        {/* Info Sidebar */}
        <div className="lg:col-span-1">
          <div className="card-modern rounded-modern-lg p-6 sticky top-6">
            <h3 className="text-sm font-bold text-[#1F2937] uppercase tracking-wider mb-4">Swap Info</h3>

            {selectedVault && (
              <div className="mb-4 p-3 bg-[#E0F2FE] rounded-lg">
                <p className="text-xs font-semibold text-[#1F2937] uppercase tracking-wider mb-1">Chain</p>
                <p className="text-sm font-bold text-[#1DBFA4]">{selectedVault.chainName || 'ethereum'}</p>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 16V4m0 0L3 8m4-4l4 4"></path>
                    <path d="M17 8v12m0 0l4-4m-4 4l-4-4"></path>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Uniswap Powered</p>
                  <p className="text-xs text-[#6B7280] mt-1">Swaps executed via Uniswap V3</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Multi-Sig Protected</p>
                  <p className="text-xs text-[#6B7280] mt-1">Same approval workflow as payments</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-[#E0F2FE] flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-[#1DBFA4]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#1F2937]">Stablecoins Only</p>
                  <p className="text-xs text-[#6B7280] mt-1">USDC, USDT, EURC supported</p>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-[#E5E7EB]">
              <p className="text-xs text-[#9CA3AF] leading-relaxed">
                Swap requests follow the same approval workflow. Quote is refreshed at release time to ensure accurate pricing.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
