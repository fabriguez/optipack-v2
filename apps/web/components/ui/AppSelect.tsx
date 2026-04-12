'use client';

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './select';
import { Label } from './label';
import { cn } from '@/lib/utils/cn';
import { forwardRef, type SelectHTMLAttributes } from 'react';

interface Option {
  value: string;
  label: string;
}

interface AppSelectProps {
  label?: string;
  error?: string;
  options: Option[];
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: { target: { value: string; name?: string } }) => void;
  onValueChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/**
 * AppSelect construit sur le Select shadcn.
 * Compatible avec react-hook-form via register() grace au synthetic onChange.
 */
export const AppSelect = forwardRef<HTMLButtonElement, AppSelectProps>(
  ({ label, error, options, placeholder, value, defaultValue, onChange, onValueChange, name, disabled, className, id }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    const handleChange = (val: string) => {
      // Appeler onValueChange si fourni (API directe)
      onValueChange?.(val);
      // Appeler onChange avec un event synthetique (compat RHF register)
      onChange?.({ target: { value: val, name } });
    };

    return (
      <div className="space-y-1.5">
        {label && <Label htmlFor={selectId}>{label}</Label>}
        <Select
          value={value}
          defaultValue={defaultValue}
          onValueChange={handleChange}
          disabled={disabled}
        >
          <SelectTrigger
            ref={ref}
            id={selectId}
            className={cn(
              'h-11 w-full rounded-xl',
              error && 'border-destructive ring-3 ring-destructive/20',
              className,
            )}
          >
            <SelectValue placeholder={placeholder || 'Selectionner...'} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  },
);

AppSelect.displayName = 'AppSelect';
