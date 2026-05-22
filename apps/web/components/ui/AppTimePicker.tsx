'use client';

import { useMemo } from 'react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from './select';
import { Label } from './label';
import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface AppTimePickerProps {
  label?: string;
  error?: string;
  /** Valeur format "HH:MM" (24h). Vide = non choisi. */
  value?: string | null;
  onChange?: (value: string) => void;
  disabled?: boolean;
  /** Pas des minutes (defaut 5). */
  minuteStep?: number;
  className?: string;
  placeholder?: string;
}

/**
 * Selecteur d'heure construit sur deux Select shadcn (heures + minutes).
 * Emet "HH:MM" 24h via onChange. Remplace les <input type="time"> natifs
 * pour une UX coherente avec le reste du design system.
 */
export function AppTimePicker({
  label,
  error,
  value,
  onChange,
  disabled,
  minuteStep = 5,
  className,
  placeholder = '--',
}: AppTimePickerProps) {
  const [hh, mm] = useMemo<[string, string]>(() => {
    const m = (value ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return ['', ''];
    return [m[1]!.padStart(2, '0'), m[2]!];
  }, [value]);

  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')),
    [],
  );
  const minutes = useMemo(
    () => Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => String(i * minuteStep).padStart(2, '0')),
    [minuteStep],
  );

  const emit = (h: string, m: string) => {
    if (!h || !m) return;
    onChange?.(`${h}:${m}`);
  };

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label>{label}</Label>}
      <div className="flex items-center gap-1.5">
        <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
        <Select
          value={hh}
          onValueChange={(h) => emit(String(h ?? ''), mm || '00')}
          disabled={disabled}
        >
          <SelectTrigger className={cn('h-11 rounded-xl', error && 'border-destructive')}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {hours.map((h) => (
              <SelectItem key={h} value={h}>{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="font-semibold text-muted-foreground">:</span>
        <Select
          value={mm}
          onValueChange={(m) => emit(hh || '00', String(m ?? ''))}
          disabled={disabled}
        >
          <SelectTrigger className={cn('h-11 rounded-xl', error && 'border-destructive')}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {minutes.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
