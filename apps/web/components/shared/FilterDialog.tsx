'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { SlidersHorizontal, X } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppSearchSelect, type SearchOption } from '@/components/ui/AppSearchSelect';
import { AppDatePicker } from '@/components/ui/AppDatePicker';

export interface FilterField {
  key: string;
  label: string;
  type: 'select' | 'text' | 'date' | 'search-select';
  options?: { value: string; label: string }[];
  /** Pour `search-select` : recherche serveur. Ex: `searchers.agencies` */
  searcher?: (query: string, limit: number) => Promise<SearchOption[]>;
  placeholder?: string;
}

interface FilterDialogProps {
  fields: FilterField[];
}

/**
 * FilterDialog qui lit/ecrit directement dans l'URL via nuqs-compatible search params.
 * Chaque filtre = un query param dans l'URL. Persistant, partageable, bookmarkable.
 */
export function FilterDialog({ fields }: FilterDialogProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Local draft des filtres (modifie dans la dialog, applique au clic)
  const [draft, setDraft] = useState<Record<string, string>>({});

  // Sync draft depuis l'URL quand on ouvre
  useEffect(() => {
    if (open) {
      const current: Record<string, string> = {};
      for (const field of fields) {
        current[field.key] = searchParams.get(field.key) || '';
      }
      setDraft(current);
    }
  }, [open, fields, searchParams]);

  // Nombre de filtres actifs dans l'URL
  const activeCount = fields.filter((f) => searchParams.get(f.key)).length;

  const apply = () => {
    const params = new URLSearchParams(searchParams.toString());
    for (const field of fields) {
      if (draft[field.key]) {
        params.set(field.key, draft[field.key]);
      } else {
        params.delete(field.key);
      }
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
  };

  const clear = () => {
    const params = new URLSearchParams(searchParams.toString());
    for (const field of fields) {
      params.delete(field.key);
    }
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
    setOpen(false);
    setDraft({});
  };

  return (
    <>
      <AppButton
        variant={activeCount > 0 ? 'primary' : 'outline'}
        size="sm"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtres
        {activeCount > 0 && (
          <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white/20 px-1 text-[10px] font-bold">
            {activeCount}
          </span>
        )}
      </AppButton>

      {activeCount > 0 && (
        <button onClick={clear} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
          <X className="h-3 w-3" />
          Effacer
        </button>
      )}

      <AppDialog open={open} onClose={() => setOpen(false)} title="Filtrer les resultats" size="md">
        <div className="space-y-4">
          {fields.map((field) => {
            const value = draft[field.key] || '';
            const onChange = (v: string) => setDraft((prev) => ({ ...prev, [field.key]: v }));

            if (field.type === 'select' && field.options) {
              return (
                <AppSelect
                  key={field.key}
                  label={field.label}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  options={[{ value: '', label: 'Tous' }, ...field.options]}
                />
              );
            }
            if (field.type === 'search-select' && field.searcher) {
              return (
                <AppSearchSelect
                  key={field.key}
                  label={field.label}
                  value={value}
                  onChange={(v) => onChange(v ?? '')}
                  search={field.searcher}
                  placeholder={field.placeholder ?? 'Tous'}
                  clearable
                />
              );
            }
            if (field.type === 'date') {
              return (
                <AppDatePicker
                  key={field.key}
                  label={field.label}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
              );
            }
            return (
              <AppInput
                key={field.key}
                label={field.label}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={field.placeholder}
              />
            );
          })}
        </div>
        <div className="flex justify-between pt-6 border-t border-gray-100 mt-6">
          <AppButton variant="ghost" onClick={clear}>Effacer les filtres</AppButton>
          <AppButton onClick={apply}>Appliquer</AppButton>
        </div>
      </AppDialog>
    </>
  );
}
