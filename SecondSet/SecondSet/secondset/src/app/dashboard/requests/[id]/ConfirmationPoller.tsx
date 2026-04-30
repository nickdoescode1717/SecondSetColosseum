'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface ConfirmationPollerProps {
  requestId: string;
  status: string;
  txHash: string | null;
}

export default function ConfirmationPoller({
  requestId,
  status,
  txHash,
}: ConfirmationPollerProps) {
  const router = useRouter();
  const [confirmations, setConfirmations] = useState<number>(0);
  const [isPolling, setIsPolling] = useState(true);

  useEffect(() => {
    // Only poll if status is BROADCASTED
    if (status !== 'BROADCASTED' || !txHash) {
      setIsPolling(false);
      return;
    }

    let intervalId: NodeJS.Timeout | null = null;

    const checkConfirmation = async () => {
      try {
        console.log('Checking confirmations...');
        const response = await fetch(`/api/requests/${requestId}/check-confirmation`, {
          method: 'POST',
        });

        const data = await response.json();
        console.log('Confirmation data:', data);

        if (data.confirmations !== undefined) {
          setConfirmations(data.confirmations);
        }

        // If confirmed or failed, refresh the page and stop polling
        if (data.confirmed || data.status === 'reverted') {
          console.log('Transaction confirmed or reverted, refreshing...');
          setIsPolling(false);
          if (intervalId) clearInterval(intervalId);
          router.refresh();
        }
      } catch (error) {
        console.error('Error checking confirmation:', error);
      }
    };

    // Check immediately
    checkConfirmation();

    // Then poll every 15 seconds
    intervalId = setInterval(checkConfirmation, 15000);

    // Cleanup
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [requestId, status, txHash, router]);

  // Only show if BROADCASTED
  if (status !== 'BROADCASTED' || !txHash) {
    return null;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-3">
        {isPolling && (
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
        )}
        <div className="flex-1">
          <p className="text-sm font-medium text-blue-900">
            Waiting for confirmation...
          </p>
          <p className="text-xs text-blue-600">
            <span className="font-semibold">{confirmations}/12</span> confirmations • Auto-updating every 15 seconds
          </p>
        </div>
      </div>
      
      {/* Progress bar */}
      <div className="mt-3 w-full bg-blue-100 rounded-full h-2">
        <div 
          className="bg-blue-600 h-2 rounded-full transition-all duration-500"
          style={{ width: `${(confirmations / 12) * 100}%` }}
        ></div>
      </div>
    </div>
  );
}