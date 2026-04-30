'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CheckIncomingButton() {
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const router = useRouter();

  async function handleCheck() {
    setLoading(true);
    setSummary(null);
    try {
      const res = await fetch('/api/admin/vaults/check-incoming', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setSummary(`Error: ${data.error}`);
      } else {
        setSummary(
          data.newRecords > 0
            ? `Found ${data.newRecords} new payment${data.newRecords !== 1 ? 's' : ''} across ${data.scanned} vault${data.scanned !== 1 ? 's' : ''}.`
            : `No new payments found (${data.scanned} vault${data.scanned !== 1 ? 's' : ''} scanned).`
        );
        router.refresh();
      }
    } catch {
      setSummary('Failed to check for incoming payments.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleCheck}
        disabled={loading}
        className="px-3 py-1.5 text-sm bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? 'Scanning...' : 'Check Now'}
      </button>
      {summary && (
        <span className="text-sm text-gray-600">{summary}</span>
      )}
    </div>
  );
}
