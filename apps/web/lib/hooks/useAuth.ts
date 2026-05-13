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
        // NextAuth v5 propage le message du throw fait dans authorize() via
        // result.error. On mappe sur des libelles user-friendly distincts
        // entre creds invalides et serveur down (sinon on dit "mauvais mdp"
        // alors que c'est l'API qui ne repond pas).
        const code = result.error;
        const message = (() => {
          switch (code) {
            case '2FA_REQUIRED':
              return '2FA_REQUIRED';
            case 'NETWORK_ERROR':
              return 'Serveur injoignable. Verifiez votre connexion ou reessayez dans un instant.';
            case 'SERVER_ERROR':
              return "Le serveur a rencontre une erreur. Reessayez dans quelques secondes ou contactez l'admin si le probleme persiste.";
            case 'INVALID_CREDENTIALS':
              return 'Email ou mot de passe incorrect.';
            case 'MISSING_FIELDS':
              return 'Email et mot de passe requis.';
            case 'UNKNOWN_ERROR':
              return 'Erreur inconnue lors de la connexion. Reessayez.';
            default:
              // CredentialsSignin / Configuration : NextAuth a sanitize le throw.
              // Cas le plus frequent = creds invalides.
              return 'Email ou mot de passe incorrect.';
          }
        })();
        throw new Error(message);
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
