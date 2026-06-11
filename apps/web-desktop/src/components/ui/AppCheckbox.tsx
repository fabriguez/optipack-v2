'use client';

import { Checkbox } from './checkbox';
import { Label } from './label';
import { cn } from '@/lib/utils/cn';

interface AppCheckboxProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function AppCheckbox({ checked, onCheckedChange, label, disabled, className, id }: AppCheckboxProps) {
  const checkboxId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <Checkbox
        id={checkboxId}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
        disabled={disabled}
        className={cn(
          'h-5 w-5 rounded-md border-2',
          checked
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-gray-300 hover:border-primary/60',
        )}
      />
      {label && (
        <Label htmlFor={checkboxId} className="text-sm text-gray-700 cursor-pointer select-none font-normal">
          {label}
        </Label>
      )}
    </div>
  );
}
