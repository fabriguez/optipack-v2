import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'optipack.';

export const storage = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  },
  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(PREFIX + key);
  },
  async clearAll(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k: string) => k.startsWith(PREFIX));
    await Promise.all(ours.map((k) => AsyncStorage.removeItem(k)));
  },
};

export const STORAGE_KEYS = {
  accessToken: 'accessToken',
  refreshToken: 'refreshToken',
  user: 'user',
  permissions: 'permissions',
  offlineQueue: 'offlineQueue.v1',
  queryCache: 'queryCache.v1',
} as const;
