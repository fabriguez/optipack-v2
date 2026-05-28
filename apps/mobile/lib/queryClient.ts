import { QueryClient } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { STORAGE_KEYS } from '@/lib/storage/storage';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 1000 * 60 * 60 * 24 * 7,
        retry: (count, err: any) => {
          if (err?.response?.status === 401 || err?.response?.status === 403) return false;
          return count < 2;
        },
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}

export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'optipack-mobile.' + STORAGE_KEYS.queryCache,
  throttleTime: 1000,
});
