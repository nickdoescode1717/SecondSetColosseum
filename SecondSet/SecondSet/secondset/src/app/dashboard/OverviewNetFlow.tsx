import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getAssetPrices } from '@/lib/chains/evm/pricing';
import { getSolanaAssetPrices } from '@/lib/chains/solana/pricing';

// Assumption: outbound = CONFIRMED payment requests (confirmedAt used as settlement date).
// Inbound = IncomingTransaction records (detectedAt used; detection lag means a same-day
//   deposit may appear next day if scanning runs with delay).
// ETH/SOL amounts are converted using CoinGecko prices (same 1-min cached source as balance display).
// EVM inbound only covers ERC-20 tokens (USDC/USDT/EURC = 1:1 USD); native ETH is not tracked.
// Stablecoins (USDC, USDT, EURC) are treated as 1:1 with USD.

const EVM_STABLES = new Set(['USDC', 'USDT', 'EURC']);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function fmt(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function timeAgo(ms: number) {
  const days = Math.floor(ms / ONE_DAY_MS);
  if (days === 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

/** Convert an outbound payment's amountMinor to USD */
function outboundToUSD(amountMinor: string, asset: string, ethPrice: number, solPrice: number): number {
  const raw = parseInt(amountMinor, 10);
  if (isNaN(raw)) return 0;
  if (EVM_STABLES.has(asset)) return raw / 1_000_000;
  if (asset === 'ETH') return (raw / 1e18) * ethPrice;
  if (asset === 'SOL') return (raw / 1e9) * solPrice;
  return 0;
}

/** Convert an inbound transfer's amount string to USD */
function inboundToUSD(amount: string, asset: string, solPrice: number): number {
  const val = parseFloat(amount);
  if (isNaN(val)) return 0;
  if (EVM_STABLES.has(asset) || asset === 'USDC') return val; // 1:1 stable
  if (asset === 'SOL') return val * solPrice;
  return 0;
}

/** Render a 30-day net-flow sparkline as pure SVG */
function Sparkline({ daily }: { daily: number[] }) {
  const W = 240;
  const H = 60;
  const BAR_W = 6;
  const GAP = 2;
  const BASELINE = H / 2;
  const maxAbs = Math.max(...daily.map(Math.abs), 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16" aria-hidden="true">
      {/* Baseline */}
      <line x1={0} y1={BASELINE} x2={W} y2={BASELINE} stroke="#E5E7EB" strokeWidth={1} />

      {daily.map((val, i) => {
        const x = i * (BAR_W + GAP);
        const barH = Math.max((Math.abs(val) / maxAbs) * (BASELINE - 4), val !== 0 ? 2 : 0);
        const positive = val >= 0;
        const y = positive ? BASELINE - barH : BASELINE;
        const color = positive ? '#1DBFA4' : '#F59E0B';
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={BAR_W}
            height={barH || 0}
            fill={color}
            rx={1}
            opacity={barH === 0 ? 0 : 1}
          />
        );
      })}
    </svg>
  );
}

interface Props {
  orgId: string;
}

export default async function OverviewNetFlow({ orgId }: Props) {
  const now = Date.now();
  const thirtyDaysAgo = new Date(now - THIRTY_DAYS_MS);

  // Fetch data and prices in parallel
  const [outboundRaw, inboundRaw, prices, solanaPrices] = await Promise.all([
    prisma.paymentRequest.findMany({
      where: { orgId, status: 'CONFIRMED', confirmedAt: { gte: thirtyDaysAgo } },
      select: { amountMinor: true, asset: true, confirmedAt: true },
    }),
    prisma.incomingTransaction.findMany({
      where: { orgId, detectedAt: { gte: thirtyDaysAgo } },
      select: { amount: true, asset: true, detectedAt: true },
    }),
    getAssetPrices(),
    getSolanaAssetPrices(),
  ]);

  // Build daily buckets (index 0 = today, 29 = oldest)
  const inboundByDay = new Array(30).fill(0) as number[];
  const outboundByDay = new Array(30).fill(0) as number[];

  for (const tx of inboundRaw) {
    const dayIdx = Math.min(Math.floor((now - tx.detectedAt.getTime()) / ONE_DAY_MS), 29);
    inboundByDay[dayIdx] += inboundToUSD(tx.amount, tx.asset, solanaPrices.sol);
  }

  for (const req of outboundRaw) {
    if (!req.confirmedAt) continue;
    const dayIdx = Math.min(Math.floor((now - req.confirmedAt.getTime()) / ONE_DAY_MS), 29);
    outboundByDay[dayIdx] += outboundToUSD(req.amountMinor, req.asset, prices.eth, solanaPrices.sol);
  }

  const netByDay = inboundByDay.map((ib, i) => ib - outboundByDay[i]);
  const totalInbound = inboundByDay.reduce((s, v) => s + v, 0);
  const totalOutbound = outboundByDay.reduce((s, v) => s + v, 0);
  const netTotal = totalInbound - totalOutbound;
  const hasData = totalInbound > 0 || totalOutbound > 0;

  return (
    <div className="card-modern p-6 rounded-modern-lg flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#1F2937]">Net Flow</h3>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Last 30 days</p>
        </div>
        <span className={`text-sm font-bold ${netTotal >= 0 ? 'text-[#10B981]' : 'text-[#F59E0B]'}`}>
          {netTotal >= 0 ? '+' : ''}{fmt(netTotal)}
        </span>
      </div>

      {/* Inbound / Outbound totals */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-[#F0FDF4] rounded-lg p-3">
          <p className="text-xs text-[#6B7280] mb-1">Inbound</p>
          <p className="text-base font-bold text-[#10B981]">{fmt(totalInbound)}</p>
          <p className="text-xs text-[#9CA3AF]">received</p>
        </div>
        <div className="bg-[#FFFBEB] rounded-lg p-3">
          <p className="text-xs text-[#6B7280] mb-1">Outbound</p>
          <p className="text-base font-bold text-[#F59E0B]">{fmt(totalOutbound)}</p>
          <p className="text-xs text-[#9CA3AF]">sent</p>
        </div>
      </div>

      {/* Sparkline */}
      <div className="flex-1">
        {hasData ? (
          <Sparkline daily={netByDay} />
        ) : (
          <div className="h-16 flex items-center justify-center">
            <p className="text-xs text-[#9CA3AF]">No confirmed transactions in the last 30 days</p>
          </div>
        )}
      </div>

      {/* X-axis labels */}
      {hasData && (
        <div className="flex justify-between mt-1">
          <span className="text-xs text-[#9CA3AF]">{timeAgo(THIRTY_DAYS_MS)}</span>
          <span className="text-xs text-[#9CA3AF]">Today</span>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-[#9CA3AF] mt-3 pt-3 border-t border-[#F3F4F6]">
        Based on confirmed outgoing payments and detected incoming transfers
      </p>
    </div>
  );
}
