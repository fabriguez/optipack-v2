'use client';

import { useQueryState, parseAsString } from 'nuqs';
import { useCallback } from 'react';

/**
 * Hook pour gerer des filtres dans l'URL via nuqs.
 * Chaque filtre est un query param distinct.
 */
export function useFilterState(key: string) {
  const [value, setValue] = useQueryState(key, parseAsString.withDefault(''));

  const set = useCallback(
    (v: string) => setValue(v || null),
    [setValue],
  );

  const clear = useCallback(() => setValue(null), [setValue]);

  return [value, set, clear] as const;
}

/**
 * Hook pour gerer plusieurs filtres a la fois.
 * Retourne un objet avec les valeurs et des setters.
 */
export function useFilters(keys: string[]) {
  // On ne peut pas appeler useQueryState dans une boucle,
  // donc on utilise une approche basee sur les search params
  const states: Record<string, string> = {};
  const setters: Record<string, (v: string) => void> = {};

  // Fallback: on lit directement depuis window.location
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    for (const key of keys) {
      states[key] = params.get(key) || '';
    }
  }

  return {
    values: states,
    setFilter: (key: string, value: string) => {
      const params = new URLSearchParams(window.location.search);
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      params.set('page', '1');
      window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
      // Trigger re-render
      window.dispatchEvent(new Event('popstate'));
    },
    clearAll: () => {
      const params = new URLSearchParams(window.location.search);
      for (const key of keys) {
        params.delete(key);
      }
      params.set('page', '1');
      window.history.pushState(null, '', `${window.location.pathname}?${params.toString()}`);
      window.dispatchEvent(new Event('popstate'));
    },
    activeCount: Object.values(states).filter(Boolean).length,
  };
}
