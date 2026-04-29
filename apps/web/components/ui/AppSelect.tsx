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
import { forwardRef, useState, useEffect } from 'react';

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
 * Compatible avec react-hook-form via register() ET Controller.
 *
 * Quand utilise avec register(), on maintient un state interne
 * pour que Radix Select affiche toujours le label correct.
 */
export const AppSelect = forwardRef<HTMLButtonElement, AppSelectProps>(
  ({ label, error, options, placeholder, value, defaultValue, onChange, onValueChange, name, disabled, className, id }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    // Internal state to track the selected value when used with register()
    // (register() provides onChange but NOT value, so Radix can't display the label)
    const [internalValue, setInternalValue] = useState<string>(value || defaultValue || '');

    // Sync internal value when controlled value changes externally
    useEffect(() => {
      if (value !== undefined) {
        setInternalValue(value);
      }
    }, [value]);

    const handleChange = (val: string | null, _eventDetails?: unknown) => {
      const safeVal = val ?? '';
      // Update internal state for display
      setInternalValue(safeVal);
      // Appeler onValueChange si fourni (API directe / Controller)
      onValueChange?.(safeVal);
      // Appeler onChange avec un event synthetique (compat RHF register)
      onChange?.({ target: { value: safeVal, name } });
    };

    // Use the controlled value if provided, otherwise use internal state
    const displayValue = value !== undefined ? value : internalValue;

    return (
      <div className="space-y-1.5">
        {label && <Label htmlFor={selectId}>{label}</Label>}
        <Select
          value={displayValue || undefined}
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
            {/*
              Base UI Select.Value affiche la valeur BRUTE par defaut (l'UUID).
              On lui passe un children-render qui resout value -> label depuis
              `options` pour afficher le bon libelle.
            */}
            <SelectValue placeholder={placeholder || 'Selectionner...'}>
              {(val: unknown) => {
                const v = typeof val === 'string' ? val : '';
                if (!v) return placeholder || 'Selectionner...';
                const match = options.find((o) => o.value === v);
                return match?.label ?? v;
              }}
            </SelectValue>
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
