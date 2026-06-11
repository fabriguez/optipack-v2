'use client';

import { useMemo } from 'react';
import { AppSelect } from './AppSelect';

interface MonthYearPickerProps {
  /** Valeur format "YYYY-MM" (vide = non choisi). */
  value: string;
  onChange: (next: string) => void;
  label?: string;
  /** Affiche un choix "Aucune" qui renvoie "". */
  allowEmpty?: boolean;
  /** Nombre d'annees passees affichees (defaut 5). */
  pastYears?: number;
  /** Nombre d'annees futures (defaut 1). */
  futureYears?: number;
  disabled?: boolean;
}

const MONTHS_FR = [
  '01 - Janvier',
  '02 - Fevrier',
  '03 - Mars',
  '04 - Avril',
  '05 - Mai',
  '06 - Juin',
  '07 - Juillet',
  '08 - Aout',
  '09 - Septembre',
  '10 - Octobre',
  '11 - Novembre',
  '12 - Decembre',
];

/**
 * Selecteur mois + annee construit sur deux AppSelect shadcn.
 * Emet "YYYY-MM" via onChange. Si allowEmpty, l'option "Aucune" renvoie "".
 *
 * Utilise par tous les champs "Periode" (paie, retenues, charges, evaluations)
 * pour empecher la saisie libre invalide et harmoniser l'UX.
 */
export function MonthYearPicker({
  value,
  onChange,
  label,
  allowEmpty = false,
  pastYears = 5,
  futureYears = 1,
  disabled,
}: MonthYearPickerProps) {
  const [year, month] = useMemo(() => {
    const match = value?.match(/^(\d{4})-(\d{2})$/);
    if (match) return [match[1], match[2]];
    return ['', ''];
  }, [value]);

  const years = useMemo(() => {
    const current = new Date().getFullYear();
    const arr: string[] = [];
    for (let y = current - pastYears; y <= current + futureYears; y++) arr.push(String(y));
    return arr;
  }, [pastYears, futureYears]);

  const yearOptions = [
    ...(allowEmpty ? [{ value: '__none__', label: 'Aucune' }] : []),
    ...years.map((y) => ({ value: y, label: y })),
  ];
  const monthOptions = MONTHS_FR.map((m) => ({ value: m.slice(0, 2), label: m }));

  const emit = (y: string, m: string) => {
    if (y === '__none__') {
      onChange('');
      return;
    }
    if (!y || !m) return;
    onChange(`${y}-${m}`);
  };

  return (
    <div className="space-y-1.5">
      {label && <p className="text-sm font-medium text-gray-700">{label}</p>}
      <div className="grid grid-cols-2 gap-2">
        <AppSelect
          options={yearOptions}
          value={year || (allowEmpty ? '__none__' : '')}
          onValueChange={(v) => emit(v, month || (v === '__none__' ? '' : String(new Date().getMonth() + 1).padStart(2, '0')))}
          placeholder="Annee"
          disabled={disabled}
        />
        <AppSelect
          options={monthOptions}
          value={month}
          onValueChange={(v) => emit(year || String(new Date().getFullYear()), v)}
          placeholder="Mois"
          disabled={disabled || !year}
        />
      </div>
    </div>
  );
}
