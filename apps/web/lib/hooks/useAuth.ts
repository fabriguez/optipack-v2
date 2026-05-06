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
