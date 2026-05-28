import NetInfo from '@react-native-community/netinfo';
import { apiClient } from './client';
import { offlineQueue, type QueuedRequest } from './offlineQueue';

let draining = false;
let listenerAttached = false;

async function drainOnce(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const entries = await offlineQueue.list();
    for (const entry of entries) {
      const ok = await replay(entry);
      if (!ok) break;
    }
  } finally {
    draining = false;
  }
}

async function replay(entry: QueuedRequest): Promise<boolean> {
  try {
    await apiClient.request({
      method: entry.method,
      url: entry.url,
      data: entry.data,
      params: entry.params,
      // Bypass queue interceptor on replay
      // @ts-expect-error custom flag
      _queued: true,
    });
    await offlineQueue.remove(entry.id);
    return true;
  } catch (err: any) {
    // Network still down: stop; resume on next reconnect
    if (!err?.response) return false;
    // Server-side error (4xx/5xx): keep entry, increment attempts, stop drain
    // to avoid bombarding API with broken payloads.
    await offlineQueue.markFailure(entry.id, String(err?.message ?? err));
    if (entry.attempts >= 4) {
      // Give up after 5 attempts; user will see it stuck in queue UI.
      return false;
    }
    return false;
  }
}

export function startOfflineDrain(): () => void {
  if (listenerAttached) return () => {};
  listenerAttached = true;
  const unsub = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      drainOnce();
    }
  });
  // initial attempt in case we start online with pending entries
  NetInfo.fetch().then((s) => {
    if (s.isConnected && s.isInternetReachable !== false) drainOnce();
  });
  return () => {
    listenerAttached = false;
    unsub();
  };
}

export { drainOnce };
