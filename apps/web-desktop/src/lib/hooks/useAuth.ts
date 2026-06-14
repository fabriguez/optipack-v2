import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuthStore } from '@/lib/auth/authStore';

interface LoginInput {
  email: string;
  password: string;
}

// Navigation en SPA via react-router (navigate). IMPORTANT : ne PAS utiliser
// window.location apres login -> le reload complet part AVANT que l'ecriture
// async du token dans le trousseau (secure_set) soit finie, donc a la
// rehydratation il n'y a pas de token -> retour login en boucle. navigate()
// garde le store en memoire, pas de reload, pas de race.

export function useLogin() {
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (input: LoginInput) => {
      try {
        return await login(input.email, input.password);
      } catch (err) {
        // Le store throw un CODE (mirroir authorize() web). On mappe sur des
        // libelles user-friendly distincts entre creds invalides et serveur
        // down (sinon on dit "mauvais mdp" alors que c'est l'API qui ne
        // repond pas).
        const code = (err as Error).message;
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
              return 'Email ou mot de passe incorrect.';
          }
        })();
        throw new Error(message);
      }
    },
    onSuccess: (user) => {
      toast.success('Connexion reussie');
      navigate('/', { replace: true });
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
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSuccess: () => {
      toast.success('Deconnexion reussie');
      navigate('/login', { replace: true });
    },
  });
}
