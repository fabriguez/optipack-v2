import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '@/lib/storage/storage';

const KEY = 'optipack.' + STORAGE_KEYS.offlineQueue;
const MAX_ENTRIES = 200;

export type QueueableMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface QueuedRequest {
  id: string;
  ts: number;
  method: QueueableMethod;
  url: string;
  data?: unknown;
  params?: Record<string, unknown>;
  attempts: number;
  lastError?: string;
}

type Listener = (state: { pending: number; entries: QueuedRequest[] }) => void;
const listeners = new Set<Listener>();

let cache: QueuedRequest[] = [];
let loaded = false;
let loadPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        cache = raw ? (JSON.parse(raw) as QueuedRequest[]) : [];
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
    const capped = cache.slice(0, MAX_ENTRIES);
    await AsyncStorage.setItem(KEY, JSON.stringify(capped));
  } catch {
    // ignore quota errors
  }
  emit();
}

function emit() {
  const snapshot = { pending: cache.length, entries: [...cache] };
  listeners.forEach((l) => l(snapshot));
}

export const offlineQueue = {
  async list(): Promise<QueuedRequest[]> {
    await ensureLoaded();
    return [...cache];
  },

  async count(): Promise<number> {
    await ensureLoaded();
    return cache.length;
  },

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

  async markFailure(id: string, error: string): Promise<void> {
    await ensureLoaded();
    const idx = cache.findIndex((e) => e.id === id);
    if (idx < 0) return;
    cache[idx] = { ...cache[idx], attempts: cache[idx].attempts + 1, lastError: error };
    await persist();
  },

  async remove(id: string): Promise<void> {
    await ensureLoaded();
    cache = cache.filter((e) => e.id !== id);
    await persist();
  },

  async clear(): Promise<void> {
    cache = [];
    await persist();
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    ensureLoaded().then(() => l({ pending: cache.length, entries: [...cache] }));
    return () => {
      listeners.delete(l);
    };
  },
};

export function isQueueableMethod(method?: string): method is QueueableMethod {
  if (!method) return false;
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

export function shouldQueueOnError(err: { response?: unknown; code?: string }): boolean {
  if (err.response) return false;
  const code = err.code ?? '';
  return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === '';
}

export class OfflineQueuedError extends Error {
  readonly isOfflineQueued = true;
  constructor(public readonly entry: QueuedRequest) {
    super("Action ajoutee a la file d'attente hors ligne");
    this.name = 'OfflineQueuedError';
  }
}
