'use client';

import { AlertCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="text-xs font-semibold uppercase tracking-wide"
        style={{ color: 'var(--skin-muted)' }}
      >
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
      {error && (
        <span
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium"
          style={{ color: '#dc2626' }}
        >
          <AlertCircle className="h-3 w-3" />
          {error}
        </span>
      )}
      {!error && hint && (
        <span className="mt-1.5 inline-block text-xs" style={{ color: 'var(--skin-muted)' }}>
          {hint}
        </span>
      )}
    </label>
  );
}
