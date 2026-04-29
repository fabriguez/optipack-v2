'use client';

import { useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect, type SearchOption } from '@/components/ui/AppSearchSelect';
import { AppInput } from '@/components/ui/AppInput';

interface FilterField {
  key: string;
  label: string;
  type: 'select' | 'text' | 'date' | 'search-select';
  options?: { value: string; label: string }[];
  searcher?: (query: string, limit: number) => Promise<SearchOption[]>;
  placeholder?: string;
}

interface AdvancedFiltersProps {
  fields: FilterField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
}

export function AdvancedFilters({ fields, values, onChange, onClear }: AdvancedFiltersProps) {
  const [expanded, setExpanded] = useState(false);
  const activeCount = Object.values(values).filter(Boolean).length;

  return (
    <div>
      <div className="flex items-center gap-2">
        <AppButton
          variant={expanded ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filtres
          {activeCount > 0 && (
            <span className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px] font-bold">
              {activeCount}
            </span>
          )}
        </AppButton>
        {activeCount > 0 && (
          <button onClick={onClear} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
            <X className="h-3 w-3" />
            Effacer
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-gray-50/50 p-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in">
          {fields.map((field) => {
            if (field.type === 'select' && field.options) {
              return (
                <AppSelect
                  key={field.key}
                  label={field.label}
                  value={values[field.key] || ''}
                  onChange={(e) => onChange(field.key, e.target.value)}
                  options={[{ value: '', label: 'Tous' }, ...field.options]}
                />
              );
            }
            if (field.type === 'search-select' && field.searcher) {
              return (
                <AppSearchSelect
                  key={field.key}
                  label={field.label}
                  value={values[field.key] || ''}
                  onChange={(v) => onChange(field.key, v ?? '')}
                  search={field.searcher}
                  placeholder={field.placeholder ?? 'Tous'}
                  clearable
                />
              );
            }
            if (field.type === 'date') {
              return (
                <AppInput
                  key={field.key}
                  label={field.label}
                  type="date"
                  value={values[field.key] || ''}
                  onChange={(e) => onChange(field.key, e.target.value)}
                />
              );
            }
            return (
              <AppInput
                key={field.key}
                label={field.label}
                value={values[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
