'use client';

import { useState, useEffect } from 'react';
import {
  CountrySelect,
  StateSelect,
  CitySelect,
} from 'react-country-state-city';
import 'react-country-state-city/dist/react-country-state-city.css';
import { Label } from './label';

interface CountrySelectFieldProps {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
  onCountryIdChange?: (id: number) => void;
  placeholder?: string;
}

export function AppCountrySelect({ label, error, value, onChange, onCountryIdChange, placeholder }: CountrySelectFieldProps) {
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div className="country-city-select">
        <CountrySelect
          onChange={(val: any) => {
            onChange?.(val?.name || '');
            onCountryIdChange?.(val?.id || 0);
          }}
          placeHolder={placeholder || 'Selectionner un pays'}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

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
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div className="country-city-select">
        <CitySelect
          countryid={countryId || 0}
          stateid={stateId || 0}
          onChange={(val: any) => {
            onChange?.(val?.name || '');
          }}
          placeHolder={placeholder || (countryId ? 'Selectionner une ville' : 'Choisir le pays d\'abord')}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

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
  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div className="country-city-select">
        <StateSelect
          countryid={countryId || 0}
          onChange={(val: any) => {
            onChange?.(val?.name || '');
            onStateIdChange?.(val?.id || 0);
          }}
          placeHolder={placeholder || (countryId ? 'Selectionner une region' : 'Choisir le pays d\'abord')}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

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
