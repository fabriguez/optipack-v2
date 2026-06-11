'use client';

import { Progress } from './progress';
import { cn } from '@/lib/utils/cn';

interface AppProgressProps {
  value: number;
  max?: number;
  label?: string;
  showValue?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'success' | 'warning' | 'error';
  className?: string;
}

const sizeStyles = { sm: 'h-1.5', md: 'h-2.5', lg: 'h-4' };
const variantStyles = {
  default: '[&_[data-slot=progress-indicator]]:bg-primary',
  success: '[&_[data-slot=progress-indicator]]:bg-green-500',
  warning: '[&_[data-slot=progress-indicator]]:bg-amber-500',
  error: '[&_[data-slot=progress-indicator]]:bg-red-500',
};

export function AppProgress({
  value,
  max = 100,
  label,
  showValue,
  size = 'md',
  variant = 'default',
  className,
}: AppProgressProps) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  const autoVariant = pct > 80 ? 'error' : pct > 50 ? 'warning' : variant;

  return (
    <div className={cn('space-y-1.5', className)}>
      {(label || showValue) && (
        <div className="flex items-center justify-between">
          {label && <span className="text-xs font-medium text-gray-500">{label}</span>}
          {showValue && <span className="text-xs font-bold text-gray-700">{pct}%</span>}
        </div>
      )}
      <Progress
        value={pct}
        className={cn(
          '**:data-[slot=progress-track]:rounded-full **:data-[slot=progress-track]:bg-gray-200',
          sizeStyles[size] && `[&_[data-slot=progress-track]]:${sizeStyles[size]}`,
          variantStyles[autoVariant],
        )}
      />
    </div>
  );
}
