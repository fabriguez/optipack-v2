'use client';

import { useMutation } from '@tanstack/react-query';
import { signIn, signOut, getSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface LoginInput {
  email: string;
  password: string;
}

export function useLogin() {
  const router = useRouter();

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      const result = await signIn('credentials', {
        email: input.email,
        password: input.password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(result.error === '2FA_REQUIRED' ? '2FA_REQUIRED' : 'Email ou mot de passe incorrect');
      }

      return result;
    },
    onSuccess: async () => {
      toast.success('Connexion reussie');
      // Personnel et chef d'agence -> portail self-service. Autres -> dashboard.
      const session = await getSession();
      const role = (session as any)?.role;
      const accessToken = (session as any)?.accessToken as string | undefined;

      // Decode JWT exp pour visibilite console : ttl reel + date.
      try {
        if (accessToken) {
          const payload = accessToken.split('.')[1];
          const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
          const obj = JSON.parse(json) as { exp?: number; iat?: number; userId?: string };
          if (obj.exp) {
            const ttl = obj.exp - Math.floor(Date.now() / 1000);
            const ttlH = (ttl / 3600).toFixed(2);
            // eslint-disable-next-line no-console
            console.log(
              `%c[Auth] login OK · token TTL=${ttl}s (${ttlH}h) · expire=${new Date(obj.exp * 1000).toLocaleString()}`,
              'color: #1B5E20; font-weight: bold;',
            );
          }
        }
      } catch {
        // ignore
      }

      if (role === 'PERSONNEL' || role === 'CHEF_AGENCE') {
        router.push('/me');
      } else {
        router.push('/');
      }
    },
    onError: (err: Error) => {
      if (err.message === '2FA_REQUIRED') {
        toast.info('Verification 2FA requise');
      } else {
        toast.error(err.message);
      }
    },
  });
}

export function useLogout() {
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      await signOut({ redirect: false });
    },
    onSuccess: () => {
      router.push('/login');
      toast.success('Deconnexion reussie');
    },
  });
}
