'use client';

import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  data: string;
  title: string;
  subtitle?: string;
  size?: number;
}

export default function QRCodeDisplay({
  data,
  title,
  subtitle,
  size = 256,
}: QRCodeDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-4 p-6 bg-white rounded-modern-lg border-2 border-[#E5E7EB]">
      <div className="text-center">
        <h3 className="text-lg font-bold text-[#1F2937]">{title}</h3>
        {subtitle && (
          <p className="text-sm text-[#6B7280] mt-1">{subtitle}</p>
        )}
      </div>

      <div className="p-4 bg-white rounded-lg border border-[#E5E7EB]">
        <QRCodeSVG
          value={data}
          size={size}
          level="H"
          includeMargin={true}
        />
      </div>

      <div className="text-xs text-[#6B7280] text-center max-w-sm">
        Scan this QR code with the SecondSet Mobile Signer App on each
        authorized device
      </div>
    </div>
  );
}
