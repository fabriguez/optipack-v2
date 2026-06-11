'use client';

import { forwardRef } from 'react';
import PhoneInput, { type Country } from 'react-phone-number-input';
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

/**
 * Drapeau rendu via image PNG (flagcdn.com) au lieu d'emoji. flagcdn sert des
 * PNG haute resolution (ratio 4:3), avec srcSet pour les ecrans Retina.
 * `country` = code ISO 2 lettres (ex: 'CM'). flagcdn attend lowercase.
 */
function FlagImage({ country, countryName }: { country: string; countryName?: string }) {
  if (!country) return null;
  const code = country.toLowerCase();
  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      srcSet={`https://flagcdn.com/w80/${code}.png 2x, https://flagcdn.com/w160/${code}.png 4x`}
      width={24}
      height={18}
      alt={countryName || country}
      loading="lazy"
      className="block h-[18px] w-6 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)]"
    />
  );
}

export const AppPhoneInput = forwardRef<HTMLInputElement, AppPhoneInputProps>(
  ({ label, error, value, onChange, onCountryChange, defaultCountry = 'CM', placeholder, disabled, className }, _ref) => {
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
          flagComponent={FlagImage as any}
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
