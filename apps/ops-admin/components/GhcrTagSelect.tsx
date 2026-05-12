'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';

interface Props {
  /** Image GHCR a interroger. */
  image: 'optipack-api' | 'optipack-web' | 'optipack-web-client';
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Permet la saisie libre en plus des suggestions GHCR (defaut: true). */
  allowFreeText?: boolean;
  /** Cache l'option "latest" si non-souhaite (defaut: affiche). */
  showLatest?: boolean;
}

interface TagListResponse {
  data: { data: { tags: string[]; configured: boolean; total?: number } };
}

/**
 * Select de tag d'image avec suggestions live depuis GHCR.
 * Tombe en mode "saisie libre" si l'API GHCR est down ou non-configuree,
 * pour ne jamais bloquer l'admin.
 */
export function GhcrTagSelect({
  image,
  value,
  onChange,
  placeholder,
  allowFreeText = true,
  showLatest = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const tags = useQuery({
    queryKey: ['ghcr-tags', image],
    queryFn: async () =>
      (await api.get(`/ghcr/tags`, { params: { image } })).data as TagListResponse['data'],
    staleTime: 60_000, // cache 1 min
  });

  const options = useMemo(() => {
    const base = tags.data?.data.tags ?? [];
    const list = showLatest && !base.includes('latest') ? ['latest', ...base] : base;
    if (!filter) return list;
    const f = filter.toLowerCase();
    return list.filter((t) => t.toLowerCase().includes(f));
  }, [tags.data, filter, showLatest]);

  const configured = tags.data?.data.configured ?? true;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-gray-50"
      >
        <span className={value ? 'font-mono' : 'text-gray-400'}>
          {value || placeholder || 'Selectionner un tag...'}
        </span>
        {tags.isFetching ? (
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {open && (
        <>
          {/* backdrop pour fermer en cliquant ailleurs */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-white shadow-lg">
            <div className="flex items-center gap-2 border-b bg-gray-50 px-3 py-2">
              <input
                autoFocus
                type="text"
                placeholder={
                  allowFreeText
                    ? 'Filtrer ou saisir un tag custom...'
                    : 'Filtrer les tags...'
                }
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && allowFreeText && filter.trim()) {
                    onChange(filter.trim());
                    setFilter('');
                    setOpen(false);
                  } else if (e.key === 'Escape') {
                    setOpen(false);
                  }
                }}
                className="flex-1 rounded border bg-white px-2 py-1 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => tags.refetch()}
                title="Rafraichir depuis GHCR"
                className="rounded p-1 hover:bg-gray-200"
              >
                <RefreshCw className="h-3.5 w-3.5 text-gray-500" />
              </button>
            </div>

            {!configured && (
              <p className="px-3 py-2 text-xs text-amber-700">
                GHCR non configure (OPS_GHCR_TOKEN manquant). Saisis le tag manuellement.
              </p>
            )}

            <ul className="max-h-72 overflow-y-auto">
              {tags.isLoading && (
                <li className="px-3 py-2 text-xs text-gray-500">Chargement...</li>
              )}
              {!tags.isLoading && options.length === 0 && (
                <li className="px-3 py-2 text-xs text-gray-500">
                  {filter ? (
                    allowFreeText ? (
                      <>
                        Aucun tag GHCR ne correspond. Appuyer sur <kbd className="rounded bg-gray-200 px-1">Entree</kbd> pour utiliser <code>{filter}</code>.
                      </>
                    ) : (
                      'Aucun resultat.'
                    )
                  ) : (
                    'Aucun tag.'
                  )}
                </li>
              )}
              {options.map((tag) => {
                const active = tag === value;
                return (
                  <li key={tag}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(tag);
                        setFilter('');
                        setOpen(false);
                      }}
                      className={
                        'flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-xs hover:bg-gray-50 ' +
                        (active ? 'bg-primary-50 text-primary-900' : '')
                      }
                    >
                      <span>{tag}</span>
                      {active && <Check className="h-3.5 w-3.5 text-primary-700" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
