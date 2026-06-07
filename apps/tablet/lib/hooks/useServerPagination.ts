import { useMemo, useState } from 'react';

export interface ServerPaginationParams {
  page: number;
  limit: number;
  search?: string;
  [key: string]: unknown;
}

/**
 * Pagination cote serveur pour les listes tablette (mirror web useServerPagination
 * mais en state local, pas dans l'URL). setSearch / setFilter remettent page=1.
 */
export function useServerPagination(initialLimit = 20) {
  const [page, setPage] = useState(1);
  const [search, setSearchRaw] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const limit = initialLimit;

  const setSearch = (value: string) => {
    setSearchRaw(value);
    setPage(1);
  };

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setPage(1);
  };

  const setManyFilters = (values: Record<string, string>) => {
    setFilters(() => {
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) if (v) next[k] = v;
      return next;
    });
    setPage(1);
  };

  const clearFilters = () => {
    setFilters({});
    setPage(1);
  };

  const queryParams = useMemo<ServerPaginationParams>(
    () => ({ page, limit, search: search || undefined, ...filters }),
    [page, limit, search, filters],
  );

  return {
    page,
    limit,
    search,
    filters,
    setPage,
    setSearch,
    setFilter,
    setManyFilters,
    clearFilters,
    queryParams,
  };
}
