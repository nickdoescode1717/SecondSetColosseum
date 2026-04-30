'use client';

import { useState } from 'react';
import KeygenModal from './KeygenModal';

export default function CreateVaultButton() {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-primary text-white font-semibold rounded-full shadow-glow hover:shadow-float transition-all hover:-translate-y-0.5"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Create Multi-Sig Wallet
      </button>

      <KeygenModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
      />
    </>
  );
}