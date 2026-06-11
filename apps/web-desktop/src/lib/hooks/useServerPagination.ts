'use client';

import { useQueryState, parseAsInteger, parseAsString } from 'nuqs';
import { useCallback } from 'react';

interface UseServerPaginationOptions {
  defaultLimit?: number;
}

export function useServerPagination(options?: UseServerPaginationOptions) {
  const { defaultLimit = 20 } = options || {};

  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1));
  const [limit] = useQueryState('limit', parseAsInteger.withDefault(defaultLimit));
  const [search, setSearchRaw] = useQueryState('search', parseAsString.withDefault(''));
  const [sortBy] = useQueryState('sortBy', parseAsString.withDefault(''));
  const [sortOrder] = useQueryState('sortOrder', parseAsString.withDefault('desc'));

  const setSearch = useCallback(
    (s: string) => {
      setSearchRaw(s || null);
      setPage(1);
    },
    [setSearchRaw, setPage],
  );

  const setFilter = useCallback(
    (key: string, _value: string) => {
      // Filters are managed by the page via nuqs directly
      setPage(1);
    },
    [setPage],
  );

  return {
    page,
    limit,
    search,
    sortBy,
    sortOrder: sortOrder as 'asc' | 'desc',
    setPage,
    setSearch,
    setFilter,
    queryParams: {
      page,
      limit,
      search: search || undefined,
      sortBy: sortBy || undefined,
      sortOrder: sortOrder as 'asc' | 'desc',
    },
  };
}
