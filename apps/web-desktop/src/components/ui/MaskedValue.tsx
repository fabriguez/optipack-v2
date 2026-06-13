import { LockKeyhole } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { ReactNode } from 'react';

export interface MaskedRef {
  id?: string | null;
  masked: true;
}

export function isMasked(value: unknown): value is MaskedRef {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as MaskedRef).masked === true
  );
}

interface MaskedValueProps {
  value: unknown;
  children?: (value: NonNullable<unknown>) => ReactNode;
  label?: string;
  className?: string;
}

export function MaskedValue({ value, children, label = 'Acces restreint', className }: MaskedValueProps) {
  if (isMasked(value)) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-xs text-gray-400', className)}>
        <LockKeyhole className="h-3 w-3 flex-shrink-0" />
        <span>{label}</span>
      </span>
    );
  }

  if (value == null) return <span className={cn('text-gray-400', className)}>—</span>;

  return <>{children ? children(value) : null}</>;
}
