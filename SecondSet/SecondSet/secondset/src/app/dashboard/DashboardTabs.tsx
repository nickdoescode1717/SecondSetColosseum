'use client';

import { useState } from 'react';

const TABS = ['Overview', 'Vaults', 'Transactions'] as const;
type Tab = typeof TABS[number];

interface Props {
  overview: React.ReactNode;
  vaults: React.ReactNode;
  transactions: React.ReactNode;
}

export default function DashboardTabs({ overview, vaults, transactions }: Props) {
  const [active, setActive] = useState<Tab>('Overview');
  const content: Record<Tab, React.ReactNode> = { Overview: overview, Vaults: vaults, Transactions: transactions };

  return (
    <>
      {/* Tab bar */}
      <div className="border-b border-[#E5E7EB] mb-8">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`px-5 py-3 text-sm font-semibold transition-colors border-b-2 -mb-px ${
                active === tab
                  ? 'text-[#1DBFA4] border-[#1DBFA4]'
                  : 'text-[#6B7280] border-transparent hover:text-[#1DBFA4]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Active tab content */}
      {content[active]}
    </>
  );
}
