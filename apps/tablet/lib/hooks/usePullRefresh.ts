import { useState } from 'react';

/**
 * Helper "pull-to-refresh" : enveloppe une fonction de rafraichissement (refetch
 * react-query, invalidation, ...) et expose l'etat pour <RefreshControl>.
 */
export function usePullRefresh(refresh: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };
  return { refreshing, onRefresh };
}
