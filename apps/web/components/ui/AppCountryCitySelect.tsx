'use client';

import { useState, useEffect, useRef } from 'react';
import {
  GetCountries,
  GetState,
  GetCity,
} from 'react-country-state-city';
import 'react-country-state-city/dist/react-country-state-city.css';
import { Label } from './label';
import { cn } from '@/lib/utils/cn';
import { ChevronDown, Search, Check } from 'lucide-react';

// ─────────────────────────────────────────────────────
//  Generic searchable select that matches shadcn style
// ─────────────────────────────────────────────────────

interface SearchableSelectProps {
  label?: string;
  error?: string;
  placeholder?: string;
  value?: string;
  options: { id: number; name: string }[];
  onChange?: (item: { id: number; name: string } | null) => void;
  disabled?: boolean;
  loading?: boolean;
}

function SearchableLocationSelect({
  label,
  error,
  placeholder = 'Selectionner...',
  value,
  options,
  onChange,
  disabled,
  loading,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleSelect = (item: { id: number; name: string }) => {
    onChange?.(item);
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div ref={ref} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          className={cn(
            'flex h-11 w-full items-center justify-between rounded-xl border bg-background px-3 text-sm transition-colors',
            'border-input hover:bg-accent/50',
            'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20',
            error && 'border-red-300 focus:border-red-500 focus:ring-red-500/20',
            disabled && 'opacity-50 cursor-not-allowed',
            !value && 'text-muted-foreground',
          )}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>

        {open && (
          <div className="absolute left-0 top-full z-50 mt-1 w-full rounded-xl border border-input bg-popover shadow-elevated animate-fade-in overflow-hidden">
            <div className="flex items-center border-b border-gray-100 px-3">
              <Search className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="h-10 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-52 overflow-y-auto p-1">
              {loading ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">Chargement...</p>
              ) : filtered.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-gray-400">Aucun resultat</p>
              ) : (
                filtered.slice(0, 100).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                      'hover:bg-accent hover:text-accent-foreground',
                      value === item.name && 'bg-primary-50 text-primary-700 font-medium',
                    )}
                  >
                    {value === item.name && <Check className="h-3.5 w-3.5 shrink-0" />}
                    <span className={cn(value !== item.name && 'ml-5.5')}>{item.name}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────
//  Country Select
// ─────────────────────────────────────────────────────

interface CountrySelectFieldProps {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
  onCountryIdChange?: (id: number) => void;
  placeholder?: string;
}

export function AppCountrySelect({ label, error, value, onChange, onCountryIdChange, placeholder }: CountrySelectFieldProps) {
  const [countries, setCountries] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    GetCountries().then((result: any[]) => {
      setCountries(result.map((c: any) => ({ id: c.id, name: c.name })));
      setLoading(false);
    });
  }, []);

  return (
    <SearchableLocationSelect
      label={label}
      error={error}
      placeholder={placeholder || 'Selectionner un pays'}
      value={value}
      options={countries}
      loading={loading}
      onChange={(item) => {
        onChange?.(item?.name || '');
        onCountryIdChange?.(item?.id || 0);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────
//  State / Region Select
// ─────────────────────────────────────────────────────

interface StateSelectFieldProps {
  label?: string;
  error?: string;
  value?: string;
  countryId?: number;
  onChange?: (value: string) => void;
  onStateIdChange?: (id: number) => void;
  placeholder?: string;
}

export function AppStateSelect({ label, error, value, countryId, onChange, onStateIdChange, placeholder }: StateSelectFieldProps) {
  const [states, setStates] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryId) { setStates([]); return; }
    setLoading(true);
    GetState(countryId).then((result: any[]) => {
      setStates(result.map((s: any) => ({ id: s.id, name: s.name })));
      setLoading(false);
    });
  }, [countryId]);

  return (
    <SearchableLocationSelect
      label={label}
      error={error}
      placeholder={placeholder || (countryId ? 'Selectionner une region' : 'Choisir le pays d\'abord')}
      value={value}
      options={states}
      loading={loading}
      disabled={!countryId}
      onChange={(item) => {
        onChange?.(item?.name || '');
        onStateIdChange?.(item?.id || 0);
      }}
    />
  );
}

// ─────────────────────────────────────────────────────
//  City Select
// ─────────────────────────────────────────────────────

interface CitySelectFieldProps {
  label?: string;
  error?: string;
  value?: string;
  countryId?: number;
  stateId?: number;
  onChange?: (value: string) => void;
  placeholder?: string;
}

export function AppCitySelect({ label, error, value, countryId, stateId, onChange, placeholder }: CitySelectFieldProps) {
  const [cities, setCities] = useState<{ id: number; name: string }[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryId) { setCities([]); return; }
    setLoading(true);
    GetCity(countryId, stateId || 0).then((result: any[]) => {
      setCities(result.map((c: any) => ({ id: c.id, name: c.name })));
      setLoading(false);
    });
  }, [countryId, stateId]);

  return (
    <SearchableLocationSelect
      label={label}
      error={error}
      placeholder={placeholder || (countryId ? 'Selectionner une ville' : 'Choisir le pays d\'abord')}
      value={value}
      options={cities}
      loading={loading}
      disabled={!countryId}
      onChange={(item) => {
        onChange?.(item?.name || '');
      }}
    />
  );
}

// ─────────────────────────────────────────────────────
//  Grouped Country + State + City
// ─────────────────────────────────────────────────────

interface CountryCityGroupProps {
  countryLabel?: string;
  cityLabel?: string;
  countryError?: string;
  cityError?: string;
  countryValue?: string;
  cityValue?: string;
  onCountryChange?: (value: string) => void;
  onCityChange?: (value: string) => void;
}

export function AppCountryCityGroup({
  countryLabel = 'Pays',
  cityLabel = 'Ville',
  countryError,
  cityError,
  countryValue,
  cityValue,
  onCountryChange,
  onCityChange,
}: CountryCityGroupProps) {
  const [countryId, setCountryId] = useState<number>(0);
  const [stateId, setStateId] = useState<number>(0);

  return (
    <>
      <AppCountrySelect
        label={countryLabel}
        error={countryError}
        value={countryValue}
        onChange={onCountryChange}
        onCountryIdChange={(id) => { setCountryId(id); setStateId(0); }}
      />
      <AppStateSelect
        label="Region"
        countryId={countryId}
        onStateIdChange={setStateId}
        onChange={() => {}}
      />
      <AppCitySelect
        label={cityLabel}
        error={cityError}
        value={cityValue}
        countryId={countryId}
        stateId={stateId}
        onChange={onCityChange}
      />
    </>
  );
}
