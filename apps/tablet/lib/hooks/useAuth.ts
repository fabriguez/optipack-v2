import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { apiClient } from '@/lib/api/client';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  agencyIds: string[];
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('accessToken');
      if (!token) { setLoading(false); return; }
      const { data } = await apiClient.get('/auth/me');
      setUser(data.data);
    } catch {
      await SecureStore.deleteItemAsync('accessToken');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { data } = await apiClient.post('/auth/login', { email, password });
      await SecureStore.setItemAsync('accessToken', data.data.accessToken);
      setUser(data.data.user);
      return data.data;
    },
  });

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync('accessToken');
    setUser(null);
  }, []);

  return { user, loading, loginMutation, logout, isAuthenticated: !!user };
}
