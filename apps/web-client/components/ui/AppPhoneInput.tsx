'use client';

import PhoneInput, { type Country } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { cn } from '@/lib/utils';

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

/**
 * Input telephone avec selecteur pays + drapeau. Aligne sur l'AppPhoneInput
 * du backoffice (apps/web). Utilise les classes `skin-*` pour respecter le
 * tenant skin actif.
 */
export function AppPhoneInput({
  label,
  error,
  value,
  onChange,
  onCountryChange,
  defaultCountry = 'CM',
  placeholder,
  disabled,
  className,
}: AppPhoneInputProps) {
  const inputId = label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-foreground">
          {label}
        </label>
      )}
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
          'app-phone-input skin-input flex h-11 w-full items-center rounded-xl border px-3 text-sm',
          'focus-within:ring-2 focus-within:ring-offset-0',
          error && 'border-red-300 focus-within:border-red-500 focus-within:ring-red-500/20',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
