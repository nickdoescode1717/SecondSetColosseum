import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getMultipleWalletBalances } from '@/lib/chains/evm/balances';
import { SupportedChain } from '@/lib/chains/evm/builder';
import { calculateWalletUSDValue } from '@/lib/chains/evm/pricing';
import { getMultipleSolanaWalletBalances } from '@/lib/chains/solana/balances';
import { calculateSolanaUSDValue } from '@/lib/chains/solana/pricing';
import { resolveVaultChain } from '@/lib/chains/utils';
import CreateVaultButton from './CreateVaultButton';
import VaultRenameButton from './VaultRenameButton';

export default async function VaultsManagementPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;

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
      chainName: (v.chainName || 'sepolia') as SupportedChain,
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

  // Calculate total liquidity across all vaults
  const evmTotal = Array.from(evmUSDValues.values()).reduce((sum, v) => sum + v.totalUsd, 0);
  const solanaTotal = Array.from(solanaUSDValues.values()).reduce((sum, v) => sum + v.totalUsd, 0);
  const totalLiquidity = evmTotal + solanaTotal;

  // Calculate breakdown by asset type
  const totalsByAsset = {
    eth: Array.from(evmUSDValues.values()).reduce((sum, v) => sum + v.ethUsd, 0),
    usdc: Array.from(evmUSDValues.values()).reduce((sum, v) => sum + v.usdcUsd, 0) +
          Array.from(solanaUSDValues.values()).reduce((sum, v) => sum + v.usdcUsd, 0),
    usdt: Array.from(evmUSDValues.values()).reduce((sum, v) => sum + v.usdtUsd, 0),
    eurc: Array.from(evmUSDValues.values()).reduce((sum, v) => sum + v.eurcUsd, 0),
    sol: Array.from(solanaUSDValues.values()).reduce((sum, v) => sum + v.solUsd, 0),
  };

  return (
    <div className="fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-[#1F2937]">Vault Management</h3>
          <p className="text-sm text-[#6B7280] mt-1">{vaults.length} total vaults</p>
        </div>
        <CreateVaultButton />
      </div>

      {/* Total Liquidity Breakdown Card */}
      {vaults.length > 0 && (
        <div className="card-modern rounded-modern-lg p-6 mb-6 bg-gradient-to-br from-[#ECFDF5] to-white">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-semibold text-[#059669] uppercase tracking-wider mb-2">Total Treasury Liquidity</p>
              <h3 className="text-4xl font-bold text-[#059669]">
                ${totalLiquidity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="w-16 h-16 rounded-full bg-gradient-primary flex items-center justify-center flex-shrink-0">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Asset Breakdown */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-5 border-t border-[#D1FAE5]">
            <div className="text-center">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">ETH</p>
              <p className="text-xl font-bold text-[#1F2937]">
                ${totalsByAsset.eth.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">SOL</p>
              <p className="text-xl font-bold text-[#1F2937]">
                ${totalsByAsset.sol.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">USDC</p>
              <p className="text-xl font-bold text-[#1F2937]">
                ${totalsByAsset.usdc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">USDT</p>
              <p className="text-xl font-bold text-[#1F2937]">
                ${totalsByAsset.usdt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-semibold text-[#6B7280] uppercase tracking-wide mb-1.5">EURC</p>
              <p className="text-xl font-bold text-[#1F2937]">
                ${totalsByAsset.eurc.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      )}

      {vaults.length === 0 ? (
        <div className="card-modern rounded-modern-lg p-12 text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-[#D1D5DB]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-[#6B7280] text-lg font-medium mb-4">No vaults configured</p>
          <CreateVaultButton />
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
              <div key={vault.id} className="card-modern rounded-modern-lg p-6 hover:shadow-float transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-primary flex items-center justify-center text-white font-bold text-lg">
                      {vault.name?.charAt(0) || 'V'}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-lg font-bold text-[#1F2937]">
                          {vault.name || 'Unnamed Vault'}
                        </h4>
                        <VaultRenameButton vaultId={vault.id} currentName={vault.name || 'Unnamed Vault'} />
                      </div>
                      <p className="text-xs text-[#6B7280] font-mono mt-0.5">
                        {vault.address.slice(0, 10)}...{vault.address.slice(-8)}
                      </p>
                    </div>
                  </div>
                  <span className="badge-modern badge-primary">
                    {resolved}
                  </span>
                </div>

                {/* Total Vault Value */}
                <div className="bg-gradient-to-br from-[#ECFDF5] to-[#F9FAFB] rounded-modern-lg p-4 mb-4">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-[#059669] uppercase tracking-wide">Total Value</span>
                    <span className="text-2xl font-bold text-[#059669]">
                      ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                {/* Balance Cards */}
                <div className="space-y-3 mb-4">
                  {isEVM ? (
                    <>
                      {/* ETH */}
                      <div className="bg-[#F3F4F6] rounded-lg p-3">
                        <div className="flex justify-between items-center">
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
                      </div>

                      {/* USDC */}
                      <div className="bg-gradient-to-r from-[#E0F2FE] to-[#F9FAFB] rounded-lg p-3">
                        <div className="flex justify-between items-center">
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
                      </div>

                      {/* USDT - Only show if non-zero */}
                      {parseFloat(evmBal?.usdt || '0') > 0 && (
                        <div className="bg-[#F0FDF4] rounded-lg p-3">
                          <div className="flex justify-between items-center">
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
                        </div>
                      )}

                      {/* EURC - Only show if non-zero */}
                      {parseFloat(evmBal?.eurc || '0') > 0 && (
                        <div className="bg-[#FEF3C7] rounded-lg p-3">
                          <div className="flex justify-between items-center">
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
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {/* SOL */}
                      <div className="bg-[#F3F4F6] rounded-lg p-3">
                        <div className="flex justify-between items-center">
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
                      </div>

                      {/* USDC (SPL) */}
                      <div className="bg-gradient-to-r from-[#E0F2FE] to-[#F9FAFB] rounded-lg p-3">
                        <div className="flex justify-between items-center">
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
                      </div>
                    </>
                  )}
                </div>

                {/* Details */}
                <div className="border-t border-[#E5E7EB] pt-4 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Network</span>
                    <span className="text-sm font-semibold text-[#1F2937]">{vault.chainName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Wallet ID</span>
                    <span className="text-xs font-mono text-[#6B7280]">
                      {vault.turnkeyWalletId.slice(0, 20)}...
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">Created</span>
                    <span className="text-sm text-[#6B7280]">
                      {new Date(vault.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
