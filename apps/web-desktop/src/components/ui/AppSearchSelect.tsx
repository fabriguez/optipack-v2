'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Loader2, Plus, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
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
  /**
   * Cle de cache React Query pour mutualiser les recherches entre instances
   * (ex: 'searcher.agencies', 'searcher.clients'). Quand fournie, les resultats
   * sont mis en cache et instantanement disponibles a la reouverture du
   * popover. Sans cette cle, le composant garde l'ancien comportement
   * (state local + debounce manuel) -- conserve pour retro-compat.
   */
  searchKey?: string;
  /**
   * Duree de fraicheur du cache en ms (defaut 60s). Pendant cette periode,
   * la recherche ne refait pas d'appel reseau.
   */
  staleTimeMs?: number;
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
  searchKey,
  staleTimeMs = 60_000,
}: AppSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Query debounce : on bufferise les frappes pendant 250ms avant d'invoquer
  // useQuery (sinon on cle-cache une recherche par caractere tape).
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [legacyResults, setLegacyResults] = useState<SearchOption[]>(options ?? []);
  const [legacyLoading, setLegacyLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [triggerWidth, setTriggerWidth] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  // ID stable utilise comme fallback de cache key quand searchKey n'est pas
  // fourni : evite de melanger les caches entre instances heterogenes.
  const fallbackKeyId = useId();

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

  // Debounce de la query pour eviter d'invoquer useQuery a chaque frappe.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // ============================================================
  // Mode "search" (asynchrone API) avec cache React Query.
  // ============================================================
  // Cle de cache : (1) prop explicite searchKey > (2) attribut .searchKey pose
  // par les helpers searchers.* > (3) fallback sur l'ID stable de l'instance
  // (pas de partage de cache mais pas de conflit non plus).
  const cacheKey =
    searchKey ?? ((search as unknown as { searchKey?: string })?.searchKey) ?? `__local-${fallbackKeyId}`;
  const queryEnabled = !!search && open;

  const queryResult = useQuery({
    queryKey: ['search-select', cacheKey, debouncedQuery, limit],
    queryFn: () => search!(debouncedQuery, limit),
    enabled: queryEnabled,
    staleTime: staleTimeMs,
    // Sur reouverture, on garde l'ancien resultat affiche pendant le refetch
    // (pas de flash "Chargement..." si la donnee est encore valide).
    placeholderData: (prev) => prev,
  });

  // ============================================================
  // Mode "options" (statique) : filtrage local immediat.
  // ============================================================
  useEffect(() => {
    if (search) return;
    if (!options) {
      setLegacyResults([]);
      return;
    }
    const q = debouncedQuery.trim().toLowerCase();
    const filtered = q
      ? options.filter(
          (o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q),
        )
      : options;
    setLegacyResults(filtered.slice(0, limit));
  }, [debouncedQuery, search, options, limit]);

  // Resultats unifies : on consomme indifferemment le mode search ou options.
  const results: SearchOption[] = search
    ? ((queryResult.data ?? []) as SearchOption[]).slice(0, limit)
    : legacyResults;
  const loading = search ? queryResult.isFetching : legacyLoading;
  void setLegacyLoading; // conserve pour compat / hooks de dev

  const selected = useMemo(() => {
    if (!value) return null;
    if (selectedOption && selectedOption.value === value) return selectedOption;
    return results.find((r) => r.value === value) ?? null;
  }, [value, selectedOption, results]);

  // Reset query a l'ouverture (UX : nouvelle recherche, pas heritee).
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

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
