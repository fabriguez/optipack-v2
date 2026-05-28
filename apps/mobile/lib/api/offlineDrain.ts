import NetInfo from '@react-native-community/netinfo';
import { apiClient } from './client';
import { offlineQueue } from './offlineQueue';

let draining = false;

async function drainOnce(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const entries = await offlineQueue.list();
    for (const e of entries) {
      try {
        await apiClient.request({
          method: e.method,
          url: e.url,
          data: e.data,
          // @ts-expect-error custom flag
          _queued: true,
        });
        await offlineQueue.remove(e.id);
      } catch (err: any) {
        if (!err?.response) break;
        await offlineQueue.remove(e.id);
      }
    }
  } finally {
    draining = false;
  }
}

export function startOfflineDrain(): () => void {
  const unsub = NetInfo.addEventListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) drainOnce();
  });
  NetInfo.fetch().then((s) => {
    if (s.isConnected && s.isInternetReachable !== false) drainOnce();
  });
  return unsub;
}
