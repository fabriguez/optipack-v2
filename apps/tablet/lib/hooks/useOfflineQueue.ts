import { useEffect, useState } from 'react';
import { offlineQueue, type QueuedRequest } from '@/lib/api/offlineQueue';

export function useOfflineQueue(): { pending: number; entries: QueuedRequest[] } {
  const [state, setState] = useState<{ pending: number; entries: QueuedRequest[] }>({
    pending: 0,
    entries: [],
  });
  useEffect(() => offlineQueue.subscribe(setState), []);
  return state;
}
