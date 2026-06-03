'use client';

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { portalApi, setToken, clearToken, type RegisterPayload } from '@/lib/api/client';

export function useLogin() {
  const router = useRouter();
  return useMutation({
    mutationFn: (vars: { identifier: string; password: string }) =>
      portalApi.login(vars.identifier, vars.password),
    onSuccess: (data) => {
      setToken(data.accessToken);
      toast.success(`Bienvenue ${data.client.fullName}`);
      router.replace('/app');
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.message || 'Identifiants invalides. Reessayez.',
      );
    },
  });
}

export function useRegister() {
  const router = useRouter();
  return useMutation({
    mutationFn: (payload: RegisterPayload) => portalApi.register(payload),
    onSuccess: (data) => {
      setToken(data.accessToken);
      toast.success(`Compte cree. Bienvenue ${data.client.fullName}`);
      router.replace('/app');
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.message || 'Inscription impossible. Verifiez vos informations.',
      );
    },
  });
}

export function useLogout() {
  const router = useRouter();
  return () => {
    clearToken();
    router.replace('/login');
  };
}
