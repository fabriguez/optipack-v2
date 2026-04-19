'use client';

import { forwardRef, type Ref } from 'react';
import PhoneInput, { type Country } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';
import { Label } from './label';
import { cn } from '@/lib/utils/cn';

interface AppPhoneInputProps {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  onCountryChange?: (country: Country | undefined) => void;
  defaultCountry?: Country;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
}

export const AppPhoneInput = forwardRef<HTMLInputElement, AppPhoneInputProps>(
  ({ label, error, value, onChange, onCountryChange, defaultCountry = 'CM', placeholder, disabled, className, name }, ref) => {
    const inputId = label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="space-y-1.5">
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <PhoneInput
          international
          defaultCountry={defaultCountry}
          value={value || ''}
          onChange={(val) => onChange?.(val)}
          onCountryChange={onCountryChange}
          placeholder={placeholder}
          disabled={disabled}
          flags={flags}
          className={cn(
            'app-phone-input flex h-11 w-full rounded-xl border border-input bg-background px-3 text-sm',
            'focus-within:border-primary-500 focus-within:ring-2 focus-within:ring-primary-500/20',
            error && 'border-red-300 focus-within:border-red-500 focus-within:ring-red-500/20',
            disabled && 'opacity-50 cursor-not-allowed',
            className,
          )}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  },
);

AppPhoneInput.displayName = 'AppPhoneInput';
