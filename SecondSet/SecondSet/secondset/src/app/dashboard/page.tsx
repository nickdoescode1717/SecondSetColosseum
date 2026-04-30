import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getMultipleWalletBalances } from '@/lib/chains/evm/balances';
import { SupportedChain } from '@/lib/chains/evm/builder';
import { calculateWalletUSDValue } from '@/lib/chains/evm/pricing';
import { getMultipleSolanaWalletBalances } from '@/lib/chains/solana/balances';
import { calculateSolanaUSDValue } from '@/lib/chains/solana/pricing';
import { resolveVaultChain } from '@/lib/chains/utils';
import { getExplorerTxUrl } from '@/lib/chains/evm/tokens';
import Link from 'next/link';
import CopyAddressButton from './CopyAddressButton';
import CheckIncomingButton from './CheckIncomingButton';
import DashboardTabs from './DashboardTabs';
import OverviewAssetAllocation, { AssetRow } from './OverviewAssetAllocation';
import OverviewNetFlow from './OverviewNetFlow';
import OverviewExceptions from './OverviewExceptions';

const EVM_CHAIN_NAMES = new Set(['ethereum', 'sepolia', 'base', 'base-sepolia']);

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;

  // Fetch vaults
  const vaults = await prisma.vault.findMany({
    where: { orgId: user.orgId },
    orderBy: { createdAt: 'desc' },
  });

  // Split vaults by resolved chain
  const evmVaults = vaults.filter(v => resolveVaultChain(v.chain, v.address) === 'EVM');
  const solanaVaults = vaults.filter(v => resolveVaultChain(v.chain, v.address) === 'SOLANA');

  // Fetch EVM balances
  const evmBalances = await getMultipleWalletBalances(
    evmVaults.map((v) => ({
      chainName: (v.chainName && EVM_CHAIN_NAMES.has(v.chainName) ? v.chainName : 'sepolia') as SupportedChain,
      address: v.address,
    }))
  );

  // Fetch Solana balances
  const solanaBalances = await getMultipleSolanaWalletBalances(
    solanaVaults.map((v) => ({
      address: v.address,
      network: v.chainName || 'solana-devnet',
    }))
  );

  // Fetch recent incoming transactions
  const recentIncoming = await prisma.incomingTransaction.findMany({
    where: { orgId: user.orgId },
    orderBy: { detectedAt: 'desc' },
    take: 10,
    include: {
      vault: { select: { id: true, name: true, address: true, chainName: true } },
    },
  });

  // Fetch recent payment requests (increased to 10 for dedicated Transactions tab)
  const requests = await prisma.paymentRequest.findMany({
    where: { orgId: user.orgId },
    include: {
      payee: true,
      vault: true,
      creator: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  // Calculate USD values for EVM vaults
  const evmUSDValues = new Map<string, Awaited<ReturnType<typeof calculateWalletUSDValue>>>();
  for (const [address, balances] of evmBalances.entries()) {
    const usdValues = await calculateWalletUSDValue(balances);
    evmUSDValues.set(address, usdValues);
  }

  // Calculate USD values for Solana vaults
  const solanaUSDValues = new Map<string, Awaited<ReturnType<typeof calculateSolanaUSDValue>>>();
  for (const [address, balances] of solanaBalances.entries()) {
    const usdValues = await calculateSolanaUSDValue(balances);
    solanaUSDValues.set(address, usdValues);
  }

  // Calculate total USD value across all vaults
  const evmTotal = Array.from(evmUSDValues.values()).reduce((sum, v) => sum + v.totalUsd, 0);
  const solanaTotal = Array.from(solanaUSDValues.values()).reduce((sum, v) => sum + v.totalUsd, 0);
  const totalUSD = evmTotal + solanaTotal;

  const pendingApprovals = requests.filter(r => r.status === 'SUBMITTED').length;
  const readyToRelease = requests.filter(r => r.status === 'READY_TO_RELEASE').length;
  const isAdmin = (user.roles as string[])?.includes('ADMIN');

  // Helper: sum a numeric USD field across all Map values
  function sumUSD<T>(map: Map<string, T>, key: keyof T): number {
    let total = 0;
    for (const v of map.values()) total += (v[key] as number) || 0;
    return total;
  }

  // Helper: sum a string-balance field across all Map values (balances are stored as decimal strings)
  function sumBal<T extends Record<string, any>>(map: Map<string, T>, key: string): number {
    let total = 0;
    for (const v of map.values()) total += parseFloat(v[key] || '0') || 0;
    return total;
  }

  // Aggregate balances and USD values cross-vault per asset for allocation card
  const rawAssets: Array<{ symbol: string; amount: number; usdValue: number }> = [
    { symbol: 'ETH',  amount: sumBal(evmBalances, 'eth'),  usdValue: sumUSD(evmUSDValues, 'ethUsd')  },
    {
      symbol: 'USDC',
      amount: sumBal(evmBalances, 'usdc') + sumBal(solanaBalances, 'usdc'),
      usdValue: sumUSD(evmUSDValues, 'usdcUsd') + sumUSD(solanaUSDValues, 'usdcUsd'),
    },
    { symbol: 'USDT', amount: sumBal(evmBalances, 'usdt'), usdValue: sumUSD(evmUSDValues, 'usdtUsd') },
    { symbol: 'EURC', amount: sumBal(evmBalances, 'eurc'), usdValue: sumUSD(evmUSDValues, 'eurcUsd') },
    { symbol: 'SOL',  amount: sumBal(solanaBalances, 'sol'), usdValue: sumUSD(solanaUSDValues, 'solUsd') },
  ];

  const assetRows: AssetRow[] = rawAssets
    .filter((a) => a.usdValue > 0)
    .sort((a, b) => b.usdValue - a.usdValue)
    .map((a) => ({ ...a, pct: totalUSD > 0 ? (a.usdValue / totalUSD) * 100 : 0 }));

  // ── Overview tab ────────────────────────────────────────────────────────────
  const overviewContent = (
    <div className="space-y-6">
      {/* Row 1: Summary stats (unchanged) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Total treasury value */}
      <div className="card-gradient p-6 rounded-modern-lg">
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-sm text-white/70 font-semibold uppercase tracking-wider mb-2">
              Total Treasury Value
            </p>
            <h3 className="text-4xl font-light text-white mb-1">
              ${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-sm text-white/90">All Assets (USD)</p>
          </div>
        </div>
        <div className="flex gap-6 pt-4 border-t border-white/20">
          <div>
            <p className="text-xs text-white/70 mb-1">Vaults</p>
            <p className="text-lg font-semibold text-white">{vaults.length}</p>
          </div>
          <div>
            <p className="text-xs text-white/70 mb-1">Recent Requests</p>
            <p className="text-lg font-semibold text-white">{requests.length}</p>
          </div>
        </div>
      </div>

      {/* Pending approvals */}
      <div className="card-modern p-6 rounded-modern-lg">
        <p className="text-xs text-[#9CA3AF] font-semibold uppercase tracking-wider mb-2">
          Pending Approvals
        </p>
        <h3 className="text-4xl font-light text-[#F59E0B] mb-2">{pendingApprovals}</h3>
        <p className="text-sm text-[#6B7280]">
          {pendingApprovals === 0 ? 'All caught up!' : 'Requires your signature'}
        </p>
      </div>

      {/* Ready to release */}
      <div className="card-modern p-6 rounded-modern-lg">
        <p className="text-xs text-[#9CA3AF] font-semibold uppercase tracking-wider mb-2">
          Ready to Release
        </p>
        <h3 className="text-4xl font-light text-[#10B981] mb-2">{readyToRelease}</h3>
        <p className="text-sm text-[#6B7280]">
          {readyToRelease === 0 ? 'Nothing pending' : 'Fully approved'}
        </p>
      </div>
    </div>

      {/* Row 2: Asset Allocation + Net Flow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <OverviewAssetAllocation assets={assetRows} totalUSD={totalUSD} />
        <OverviewNetFlow orgId={user.orgId} />
      </div>

      {/* Row 3: Exceptions */}
      <OverviewExceptions orgId={user.orgId} />
    </div>
  );

  // ── Vaults tab ──────────────────────────────────────────────────────────────
  const vaultsContent = (
    <div>
      {vaults.length === 0 ? (
        <div className="card-modern p-12 text-center rounded-modern-lg">
          <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-[#6B7280]">No vaults configured. Contact an admin to set up vaults.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {vaults.map((vault) => {
            const resolved = resolveVaultChain(vault.chain, vault.address);
            const isEVM = resolved === 'EVM';
            const evmBal = isEVM ? evmBalances.get(vault.address) : undefined;
            const evmUsd = isEVM ? evmUSDValues.get(vault.address) : undefined;
            const solBal = !isEVM ? solanaBalances.get(vault.address) : undefined;
            const solUsd = !isEVM ? solanaUSDValues.get(vault.address) : undefined;
            const totalValue = isEVM ? (evmUsd?.totalUsd || 0) : (solUsd?.totalUsd || 0);

            return (
              <div key={vault.id} className="card-modern p-6 rounded-modern-lg overflow-hidden">
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-[#1F2937] text-lg mb-2 truncate">
                      {vault.name || 'Unnamed Vault'}
                    </h4>
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-xs text-[#6B7280] font-mono truncate flex-1 min-w-0">
                        {vault.address}
                      </p>
                      <div className="flex-shrink-0">
                        <CopyAddressButton address={vault.address} />
                      </div>
                    </div>
                  </div>
                  <span className="badge-modern badge-primary flex-shrink-0">{resolved}</span>
                </div>

                {/* Total vault value */}
                <div className="bg-gradient-to-br from-[#ECFDF5] to-[#F9FAFB] rounded-lg p-3 mb-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-[#059669] uppercase tracking-wide">Total Value</span>
                    <span className="text-xl font-bold text-[#059669]">
                      ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {isEVM ? (
                    <>
                      {/* ETH */}
                      <div className="flex justify-between items-center p-3 bg-[#F3F4F6] rounded-lg">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                            <span className="text-lg font-bold text-[#1F2937]">{'\u27E0'}</span>
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-[#1F2937]">ETH</span>
                            <span className="text-xs text-[#9CA3AF] block">
                              ${(evmUsd?.ethUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[#1F2937]">
                          {parseFloat(evmBal?.eth || '0').toFixed(4)} ETH
                        </span>
                      </div>

                      {/* USDC */}
                      <div className="flex justify-between items-center p-3 bg-gradient-to-r from-[#E0F2FE] to-[#F9FAFB] rounded-lg">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                            <span className="text-lg font-bold text-[#1F2937]">$</span>
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-[#1F2937]">USDC</span>
                            <span className="text-xs text-[#9CA3AF] block">
                              ${(evmUsd?.usdcUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[#1F2937]">
                          ${parseFloat(evmBal?.usdc || '0').toFixed(2)}
                        </span>
                      </div>

                      {/* USDT — only if non-zero */}
                      {parseFloat(evmBal?.usdt || '0') > 0 && (
                        <div className="flex justify-between items-center p-3 bg-[#F0FDF4] rounded-lg">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                              <span className="text-lg font-bold text-[#1F2937]">$</span>
                            </div>
                            <div>
                              <span className="text-sm font-semibold text-[#1F2937]">USDT</span>
                              <span className="text-xs text-[#9CA3AF] block">
                                ${(evmUsd?.usdtUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-[#1F2937]">
                            ${parseFloat(evmBal?.usdt || '0').toFixed(2)}
                          </span>
                        </div>
                      )}

                      {/* EURC — only if non-zero */}
                      {parseFloat(evmBal?.eurc || '0') > 0 && (
                        <div className="flex justify-between items-center p-3 bg-[#FEF3C7] rounded-lg">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                              <span className="text-lg font-bold text-[#1F2937]">{'\u20AC'}</span>
                            </div>
                            <div>
                              <span className="text-sm font-semibold text-[#1F2937]">EURC</span>
                              <span className="text-xs text-[#9CA3AF] block">
                                ${(evmUsd?.eurcUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-[#1F2937]">
                            {'\u20AC'}{parseFloat(evmBal?.eurc || '0').toFixed(2)}
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* SOL */}
                      <div className="flex justify-between items-center p-3 bg-[#F3F4F6] rounded-lg">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                            <span className="text-lg font-bold text-[#9945FF]">S</span>
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-[#1F2937]">SOL</span>
                            <span className="text-xs text-[#9CA3AF] block">
                              ${(solUsd?.solUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[#1F2937]">
                          {parseFloat(solBal?.sol || '0').toFixed(4)} SOL
                        </span>
                      </div>

                      {/* USDC (SPL) */}
                      <div className="flex justify-between items-center p-3 bg-gradient-to-r from-[#E0F2FE] to-[#F9FAFB] rounded-lg">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shadow-sm">
                            <span className="text-lg font-bold text-[#1F2937]">$</span>
                          </div>
                          <div>
                            <span className="text-sm font-semibold text-[#1F2937]">USDC</span>
                            <span className="text-xs text-[#9CA3AF] block">
                              ${(solUsd?.usdcUsd || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-semibold text-[#1F2937]">
                          ${parseFloat(solBal?.usdc || '0').toFixed(2)}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {vault.chainName && (
                  <p className="text-xs text-[#9CA3AF] mt-4 pt-4 border-t border-[#E5E7EB] truncate">
                    Network: <span className="font-semibold text-[#6B7280]">{vault.chainName}</span>
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Transactions tab ─────────────────────────────────────────────────────────
  const transactionsContent = (
    <div className="space-y-10">
      {/* Received Payments */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold text-[#1F2937]">Received Payments</h3>
            <p className="text-sm text-[#6B7280] mt-1">Incoming transfers detected on-chain</p>
          </div>
          {isAdmin && <CheckIncomingButton />}
        </div>

        {recentIncoming.length === 0 ? (
          <div className="card-modern p-8 text-center rounded-modern-lg">
            <svg className="w-12 h-12 mx-auto mb-3 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <p className="text-[#6B7280] text-sm">No incoming payments detected yet.</p>
            {isAdmin && (
              <p className="text-xs text-[#9CA3AF] mt-1">
                Click &quot;Check Now&quot; above to scan for incoming transfers.
              </p>
            )}
          </div>
        ) : (
          <div className="card-modern rounded-modern-lg overflow-hidden">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Vault</th>
                  <th>Asset</th>
                  <th>Amount</th>
                  <th>From</th>
                  <th>Detected</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {recentIncoming.map((tx) => {
                  const isSolana = !tx.vault.address.startsWith('0x');
                  const explorerUrl = isSolana
                    ? `https://solscan.io/tx/${tx.txHash}${tx.vault.chainName === 'solana-devnet' ? '?cluster=devnet' : ''}`
                    : getExplorerTxUrl(tx.chainName, tx.txHash);
                  return (
                    <tr key={tx.id}>
                      <td>
                        <div className="font-semibold text-[#1F2937] text-sm">
                          {tx.vault.name || 'Unnamed Vault'}
                        </div>
                        <div className="text-xs text-[#9CA3AF] font-mono">
                          {tx.vault.address.slice(0, 8)}...{tx.vault.address.slice(-6)}
                        </div>
                      </td>
                      <td>
                        <span className="badge-modern badge-success text-xs">{tx.asset}</span>
                      </td>
                      <td>
                        <span className="font-semibold text-[#1F2937]">
                          {parseFloat(tx.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}
                        </span>
                      </td>
                      <td>
                        <span className="text-xs text-[#6B7280] font-mono">
                          {tx.fromAddress
                            ? `${tx.fromAddress.slice(0, 8)}...${tx.fromAddress.slice(-6)}`
                            : '—'}
                        </span>
                      </td>
                      <td>
                        <div className="text-sm text-[#6B7280]">
                          {new Date(tx.detectedAt).toLocaleDateString()}
                        </div>
                        <div className="text-xs text-[#9CA3AF]">
                          {new Date(tx.detectedAt).toLocaleTimeString()}
                        </div>
                      </td>
                      <td>
                        {explorerUrl ? (
                          <a
                            href={explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-[#1DBFA4] hover:text-[#179983] font-mono underline"
                          >
                            {tx.txHash.slice(0, 10)}...
                          </a>
                        ) : (
                          <span className="text-xs text-[#9CA3AF] font-mono">
                            {tx.txHash.slice(0, 10)}...
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sent Payments */}
      <div>
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-xl font-bold text-[#1F2937]">Sent Payments</h3>
            <p className="text-sm text-[#6B7280] mt-1">Recent outgoing payment requests</p>
          </div>
          <Link
            href="/dashboard/requests"
            className="text-sm font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
          >
            View All →
          </Link>
        </div>

        {requests.length === 0 ? (
          <div className="card-modern p-12 text-center rounded-modern-lg">
            <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[#6B7280] mb-4">No payment requests yet</p>
            {(user.roles as string[])?.includes('INITIATOR') && (
              <Link
                href="/dashboard/requests/new"
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Your First Request
              </Link>
            )}
          </div>
        ) : (
          <div className="card-modern rounded-modern-lg overflow-hidden">
            <table className="table-modern">
              <thead>
                <tr>
                  <th>Payee</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="cursor-pointer">
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block">
                        <div className="font-semibold text-[#1F2937]">{request.payee.name}</div>
                        {request.memo && (
                          <div className="text-xs text-[#9CA3AF] mt-0.5">{request.memo}</div>
                        )}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block font-semibold text-[#1F2937]">
                        ${(parseInt(request.amountMinor) / 1_000_000).toFixed(2)}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block">
                        <span className={`badge-modern ${
                          request.status === 'CONFIRMED' ? 'badge-success' :
                          request.status === 'BROADCASTED' ? 'badge-info' :
                          request.status === 'READY_TO_RELEASE' ? 'badge-primary' :
                          request.status === 'SUBMITTED' ? 'badge-warning' :
                          'bg-[#F3F4F6] text-[#6B7280]'
                        }`}>
                          {request.status}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Link href={`/dashboard/requests/${request.id}`} className="block text-[#6B7280]">
                        <div className="text-sm font-medium">{new Date(request.createdAt).toLocaleDateString()}</div>
                        <div className="text-xs text-[#9CA3AF]">{request.creator.name}</div>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <DashboardTabs
        overview={overviewContent}
        vaults={vaultsContent}
        transactions={transactionsContent}
      />
    </div>
  );
}
