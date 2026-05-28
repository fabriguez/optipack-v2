import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/lib/storage/storage';

const KEY = 'optipack-mobile.' + STORAGE_KEYS.offlineQueue;
const MAX_ENTRIES = 100;

export type QueueableMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface QueuedRequest {
  id: string;
  ts: number;
  method: QueueableMethod;
  url: string;
  data?: unknown;
  attempts: number;
}

let cache: QueuedRequest[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        cache = raw ? JSON.parse(raw) : [];
      } catch {
        cache = [];
      }
      loaded = true;
    })();
  }
  await loadPromise;
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache.slice(0, MAX_ENTRIES)));
  } catch {}
}

export const offlineQueue = {
  async enqueue(input: Omit<QueuedRequest, 'id' | 'ts' | 'attempts'>): Promise<QueuedRequest> {
    await ensureLoaded();
    const entry: QueuedRequest = {
      id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      attempts: 0,
      ...input,
    };
    cache.push(entry);
    await persist();
    return entry;
  },
  async list(): Promise<QueuedRequest[]> {
    await ensureLoaded();
    return [...cache];
  },
  async remove(id: string): Promise<void> {
    await ensureLoaded();
    cache = cache.filter((e) => e.id !== id);
    await persist();
  },
  async count(): Promise<number> {
    await ensureLoaded();
    return cache.length;
  },
};

export function isQueueableMethod(method?: string): method is QueueableMethod {
  return !!method && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export function shouldQueueOnError(err: { response?: unknown; code?: string }): boolean {
  if (err.response) return false;
  const code = err.code ?? '';
  return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === '';
}

export class OfflineQueuedError extends Error {
  readonly isOfflineQueued = true;
  constructor(public readonly entry: QueuedRequest) {
    super("Action mise en attente hors ligne");
    this.name = 'OfflineQueuedError';
  }
}
