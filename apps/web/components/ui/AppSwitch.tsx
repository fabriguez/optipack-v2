'use client';

import { Switch } from './switch';
import { cn } from '@/lib/utils/cn';

interface AppSwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function AppSwitch({ checked, onCheckedChange, label, disabled, className }: AppSwitchProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      {label && <span className="text-sm text-gray-700">{label}</span>}
    </div>
  );
}
