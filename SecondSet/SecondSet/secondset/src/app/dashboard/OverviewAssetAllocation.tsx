export interface AssetRow {
  symbol: string;
  amount: number;
  usdValue: number;
  pct: number;
}

interface Props {
  assets: AssetRow[];
  totalUSD: number;
}

const ASSET_COLORS: Record<string, string> = {
  ETH:  '#627EEA',
  USDC: '#2775CA',
  USDT: '#26A17B',
  EURC: '#003087',
  SOL:  '#9945FF',
};

const ASSET_LABELS: Record<string, string> = {
  ETH:  'Ether',
  USDC: 'USD Coin',
  USDT: 'Tether',
  EURC: 'Euro Coin',
  SOL:  'Solana',
};

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function AssetRowItem({ row }: { row: AssetRow }) {
  const color = ASSET_COLORS[row.symbol] ?? '#1DBFA4';
  return (
    <div className="flex items-center gap-3 py-2.5">
      {/* Icon */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
        style={{ backgroundColor: color }}
      >
        {row.symbol.slice(0, 2)}
      </div>

      {/* Name + amount */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center mb-1">
          <div>
            <span className="text-sm font-semibold text-[#1F2937]">{row.symbol}</span>
            <span className="text-xs text-[#9CA3AF] ml-1.5">{ASSET_LABELS[row.symbol] ?? ''}</span>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            <span className="text-sm font-semibold text-[#1F2937]">${fmt(row.usdValue)}</span>
            <span className="text-xs text-[#9CA3AF] ml-1">{fmt(row.pct, 1)}%</span>
          </div>
        </div>
        {/* Allocation bar */}
        <div className="h-1.5 w-full bg-[#F3F4F6] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.max(row.pct, 0.5)}%`, backgroundColor: color }}
          />
        </div>
        <div className="text-xs text-[#9CA3AF] mt-0.5">
          {row.symbol === 'ETH' ? fmt(row.amount, 4)
            : row.symbol === 'SOL' ? fmt(row.amount, 4)
            : fmt(row.amount, 2)} {row.symbol} held
        </div>
      </div>
    </div>
  );
}

export default function OverviewAssetAllocation({ assets, totalUSD }: Props) {
  const TOP_N = 5;
  const visible = assets.slice(0, TOP_N);
  const overflow = assets.slice(TOP_N);

  return (
    <div className="card-modern p-6 rounded-modern-lg">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#1F2937]">Asset Allocation</h3>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Portfolio breakdown by asset</p>
        </div>
        <span className="text-xs font-semibold text-[#6B7280] bg-[#F3F4F6] px-2.5 py-1 rounded-full">
          {assets.length} asset{assets.length !== 1 ? 's' : ''}
        </span>
      </div>

      {assets.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-[#9CA3AF]">No assets held in vaults yet.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#F3F4F6]">
          {visible.map((row) => (
            <AssetRowItem key={row.symbol} row={row} />
          ))}

          {overflow.length > 0 && (
            <details className="group">
              <summary className="flex items-center gap-1.5 py-2 text-xs font-semibold text-[#1DBFA4] cursor-pointer select-none list-none hover:text-[#179983] transition-colors">
                <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Show {overflow.length} more asset{overflow.length !== 1 ? 's' : ''}
              </summary>
              <div className="divide-y divide-[#F3F4F6]">
                {overflow.map((row) => (
                  <AssetRowItem key={row.symbol} row={row} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-[#F3F4F6] flex justify-between items-center">
        <span className="text-xs text-[#9CA3AF]">Total treasury</span>
        <span className="text-sm font-bold text-[#1F2937]">${fmt(totalUSD)}</span>
      </div>
    </div>
  );
}
