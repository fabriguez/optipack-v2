'use client';

import type { ProviderCapabilities } from '@transitsoftservices/payments';

const PROVIDER_COLORS: Record<string, string> = {
  'mtn-momo': '#FFCB05',
  'orange-money': '#FF6600',
  'wave': '#1DC8F1',
  'airtel-money': '#E40000',
  'moov-money': '#0066B3',
  'stripe': '#635BFF',
};

export function ProviderBadge({
  cap,
  index,
}: {
  cap: ProviderCapabilities;
  index: number;
}) {
  const color = PROVIDER_COLORS[cap.id] ?? 'var(--skin-primary)';
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 skin-radius-sm"
      style={{
        background: 'var(--skin-surface)',
        border: '1px solid var(--skin-border)',
      }}
    >
      <span
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white"
        style={{ background: color }}
      >
        {cap.name
          .split(' ')
          .map((p) => p[0])
          .slice(0, 2)
          .join('')}
      </span>
      <div className="min-w-0">
        <p
          className="truncate text-xs font-semibold"
          style={{ color: 'var(--skin-foreground)' }}
        >
          {cap.name}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--skin-muted)' }}>
          {index === 0 ? 'Essai principal' : `Fallback ${index}`}
        </p>
      </div>
    </div>
  );
}
