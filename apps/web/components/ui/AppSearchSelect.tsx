'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Input } from './input';
import { Label } from './label';
import { cn } from '@/lib/utils/cn';

export interface SearchOption {
  value: string;
  label: string;
  sublabel?: string | null;
}

export interface AppSearchSelectProps {
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  value?: string | null;
  onChange?: (value: string | null) => void;
  /**
   * Recherche cote serveur. Doit retourner au plus `limit` resultats.
   * Si non fourni, le filtrage se fait sur `options` localement.
   */
  search?: (query: string, limit: number) => Promise<SearchOption[]>;
  options?: SearchOption[];
  /**
   * Permet de creer une nouvelle entite directement depuis le select.
   * Si fourni, un bouton "Creer ..." s'affiche avec la valeur de recherche.
   */
  onCreate?: (query: string) => Promise<SearchOption | null> | void;
  createLabel?: string;
  limit?: number;
  disabled?: boolean;
  error?: string;
  className?: string;
  required?: boolean;
  /**
   * Permet d'afficher l'option actuellement selectionnee meme si elle ne fait
   * pas partie des derniers resultats de recherche.
   */
  selectedOption?: SearchOption | null;
  clearable?: boolean;
}

export function AppSearchSelect({
  label,
  placeholder = 'Selectionner...',
  searchPlaceholder = 'Rechercher...',
  emptyMessage = 'Aucun resultat',
  value,
  onChange,
  search,
  options,
  onCreate,
  createLabel = 'Creer',
  limit = 10,
  disabled,
  error,
  className,
  required,
  selectedOption,
  clearable = true,
}: AppSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchOption[]>(options ?? []);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  // Mesure la largeur du trigger pour aligner la largeur du popover (Base UI
  // n'expose pas de CSS var trigger-width comme Radix).
  useEffect(() => {
    if (!triggerRef.current) return;
    const el = triggerRef.current;
    const update = () => setTriggerWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const selected = useMemo(() => {
    if (!value) return null;
    if (selectedOption && selectedOption.value === value) return selectedOption;
    return results.find((r) => r.value === value) ?? null;
  }, [value, selectedOption, results]);

  // Recherche debounced
  useEffect(() => {
    if (!open) return;

    if (search) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(async () => {
        setLoading(true);
        try {
          const found = await search(query, limit);
          setResults(found.slice(0, limit));
        } catch {
          setResults([]);
        } finally {
          setLoading(false);
        }
      }, 250);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }

    if (options) {
      const q = query.trim().toLowerCase();
      const filtered = q
        ? options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q))
        : options;
      setResults(filtered.slice(0, limit));
    }
  }, [query, open, search, options, limit]);

  // Charger initialement quand on ouvre
  useEffect(() => {
    if (open && results.length === 0 && !loading) {
      setQuery('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelect = (opt: SearchOption) => {
    onChange?.(opt.value);
    setOpen(false);
    setQuery('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange?.(null);
  };

  const handleCreate = async () => {
    if (!onCreate || !query.trim()) return;
    setCreating(true);
    try {
      const created = await onCreate(query.trim());
      if (created) {
        handleSelect(created);
      }
    } finally {
      setCreating(false);
    }
  };

  const showCreateOption =
    !!onCreate &&
    query.trim().length > 0 &&
    !results.some((r) => r.label.toLowerCase() === query.trim().toLowerCase());

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label>
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          ref={triggerRef}
          disabled={disabled}
          className={cn(
            'flex h-11 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-left text-sm ring-offset-background',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive ring-2 ring-destructive/20',
          )}
        >
          <span className={cn('flex-1 truncate', !selected && 'text-muted-foreground')}>
            {selected?.label ?? placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
            {clearable && selected && !disabled && (
              <span
                role="button"
                tabIndex={0}
                onClick={handleClear}
                onKeyDown={(e) => e.key === 'Enter' && handleClear(e as never)}
                className="rounded p-0.5 hover:bg-gray-100"
                aria-label="Effacer la selection"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown className="h-4 w-4" />
          </span>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          className="z-50 p-0"
          style={triggerWidth ? { width: triggerWidth } : undefined}
        >
          <div className="border-b p-2">
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 rounded-lg"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {loading && (
              <div className="flex items-center justify-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement...
              </div>
            )}
            {!loading && results.length === 0 && !showCreateOption && (
              <div className="px-3 py-4 text-center text-sm text-muted-foreground">{emptyMessage}</div>
            )}
            {!loading &&
              results.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-primary-50',
                      isSelected && 'bg-primary-50 font-medium',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{opt.label}</div>
                      {opt.sublabel && (
                        <div className="truncate text-xs text-muted-foreground">{opt.sublabel}</div>
                      )}
                    </div>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-primary-600" />}
                  </button>
                );
              })}
            {showCreateOption && (
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating}
                className="flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-left text-sm text-primary-700 hover:bg-primary-50 disabled:opacity-60"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                <span className="truncate">
                  {createLabel} <strong>&quot;{query.trim()}&quot;</strong>
                </span>
              </button>
            )}
          </div>
          <div className="flex items-center justify-between border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              {results.length} resultat{results.length > 1 ? 's' : ''} (max {limit})
            </span>
          </div>
        </PopoverContent>
      </Popover>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
