'use client';

import { AppDatePicker } from './AppDatePicker';

export interface DateRange {
  from: string;
  to: string;
}

interface DateRangePickerProps {
  label?: string;
  value: DateRange;
  onChange: (next: DateRange) => void;
  disabled?: boolean;
  fromLabel?: string;
  toLabel?: string;
  required?: boolean;
}

/**
 * Selecteur d'intervalle de dates : deux champs date (debut/fin) cote a cote.
 * Emet { from, to } au format YYYY-MM-DD. Si une seule borne est saisie,
 * l'autre reste vide cote etat (le parent decide de la valeur par defaut).
 *
 * Utilise pour les champs "periode" semantiques range (evaluations RH,
 * filtres date) -- pas pour les periodes mensuelles de facturation/paie
 * (utiliser MonthYearPicker pour ces dernieres).
 */
export function DateRangePicker({
  label,
  value,
  onChange,
  disabled,
  fromLabel = 'Debut',
  toLabel = 'Fin',
  required,
}: DateRangePickerProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <p className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <AppDatePicker
          label={fromLabel}
          value={value.from}
          max={value.to || undefined}
          onChange={(e) => onChange({ from: e.target.value, to: value.to })}
          disabled={disabled}
        />
        <AppDatePicker
          label={toLabel}
          value={value.to}
          min={value.from || undefined}
          onChange={(e) => onChange({ from: value.from, to: e.target.value })}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
