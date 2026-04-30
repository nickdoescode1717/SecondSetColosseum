'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type IssueKind = 'FAILED_BROADCAST' | 'FAILED_CONFIRM' | 'STUCK';

export interface SerializableIssue {
  kind: IssueKind;
  requestId: string;
  payeeName: string;
  asset: string;
  amountMinor: string;
  occurredAt: number; // ms timestamp
  errorMessage?: string | null;
}

const STORAGE_KEY = 'secondset_dismissed_exceptions';

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtAmount(amountMinor: string, asset: string): string {
  const raw = parseInt(amountMinor, 10);
  if (isNaN(raw)) return amountMinor;
  if (asset === 'ETH') return `${(raw / 1e18).toFixed(4)} ETH`;
  if (asset === 'SOL') return `${(raw / 1e9).toFixed(4)} SOL`;
  return `$${(raw / 1_000_000).toFixed(2)} ${asset}`;
}

function IssueIcon({ kind }: { kind: IssueKind }) {
  if (kind === 'STUCK') {
    return (
      <div className="w-7 h-7 rounded-full bg-[#FEF3C7] flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
    );
  }
  return (
    <div className="w-7 h-7 rounded-full bg-[#FEE2E2] flex items-center justify-center flex-shrink-0">
      <svg className="w-4 h-4 text-[#EF4444]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </div>
  );
}

function issueLabel(kind: IssueKind): string {
  if (kind === 'FAILED_BROADCAST') return 'Broadcast failed';
  if (kind === 'FAILED_CONFIRM') return 'Confirmation failed';
  return 'Stuck in confirmation';
}

interface Props {
  issues: SerializableIssue[];
}

export default function ExceptionsClient({ issues }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Load dismissed IDs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setDismissed(new Set(JSON.parse(stored) as string[]));
    } catch {}
  }, []);

  function dismiss(requestId: string) {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(requestId);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }

  const visible = issues.filter((i) => !dismissed.has(i.requestId));
  const displayIssues = visible.slice(0, 5);
  const allClear = visible.length === 0;
  const failedCount = visible.filter((i) => i.kind !== 'STUCK').length;
  const stuckCount = visible.filter((i) => i.kind === 'STUCK').length;

  return (
    <>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[#1F2937]">Needs Attention</h3>
          <p className="text-xs text-[#9CA3AF] mt-0.5">Failures and stuck transactions</p>
        </div>
        {allClear ? (
          <span className="badge-modern badge-success text-xs">All clear</span>
        ) : (
          <div className="flex items-center gap-2">
            {failedCount > 0 && (
              <span className="badge-modern badge-danger text-xs">{failedCount} failed</span>
            )}
            {stuckCount > 0 && (
              <span className="badge-modern badge-warning text-xs">{stuckCount} stuck</span>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      {allClear ? (
        <div className="flex items-center gap-3 py-4">
          <div className="w-10 h-10 rounded-full bg-[#F0FDF4] flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-[#10B981]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1F2937]">No issues detected</p>
            <p className="text-xs text-[#9CA3AF]">All transactions are processing normally.</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-[#F3F4F6]">
          {displayIssues.map((issue) => (
            <div
              key={`${issue.kind}-${issue.requestId}`}
              className="flex items-center gap-1 py-3 -mx-2 px-2 rounded-lg group hover:bg-[#F9FAFB] transition-colors"
            >
              {/* Clickable row content */}
              <Link
                href={`/dashboard/requests/${issue.requestId}`}
                className="flex items-center gap-3 flex-1 min-w-0"
              >
                <IssueIcon kind={issue.kind} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold text-[#374151]">{issueLabel(issue.kind)}</span>
                    <span className="text-xs text-[#9CA3AF]">·</span>
                    <span className="text-xs text-[#6B7280]">{issue.payeeName}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-[#1F2937]">{fmtAmount(issue.amountMinor, issue.asset)}</span>
                    <span className="text-xs text-[#9CA3AF]">{timeAgo(issue.occurredAt)}</span>
                  </div>
                  {issue.errorMessage && (
                    <p className="text-xs text-[#EF4444] mt-0.5 truncate">{issue.errorMessage}</p>
                  )}
                </div>
                <svg
                  className="w-4 h-4 text-[#D1D5DB] group-hover:text-[#1DBFA4] flex-shrink-0 transition-colors"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>

              {/* Ignore button — appears on row hover */}
              <button
                onClick={() => dismiss(issue.requestId)}
                title="Ignore this issue"
                className="flex-shrink-0 ml-1 w-6 h-6 flex items-center justify-center rounded-full text-[#9CA3AF] hover:bg-[#E5E7EB] hover:text-[#6B7280] transition-colors opacity-0 group-hover:opacity-100"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          {visible.length > 5 && (
            <div className="pt-3">
              <Link
                href="/dashboard/requests"
                className="text-xs font-semibold text-[#1DBFA4] hover:text-[#179983] transition-colors"
              >
                View all {visible.length} issues →
              </Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}
