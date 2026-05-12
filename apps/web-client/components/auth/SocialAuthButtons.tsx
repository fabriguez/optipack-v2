'use client';

import { toast } from 'sonner';

interface Props {
  // 'register' adapte le libellé ("Continuer avec…") vs 'login' ("Se connecter avec…")
  intent: 'register' | 'login';
}

/**
 * Boutons OAuth Google / Apple / Facebook pour le portail client public.
 *
 * Etat actuel : les providers OAuth ne sont pas encore configures cote backend
 * (cf. TODO.md, section "Portail public - OAuth"). On expose les boutons en UI
 * pour que le parcours soit deja en place ; le clic ouvre une notification
 * "bientot disponible" plutot qu'une 404. Quand les endpoints backend seront
 * prets (/api/v1/client-portal/oauth/<provider>/start), il suffira de
 * remplacer le `handleClick` par une navigation.
 */
export function SocialAuthButtons({ intent }: Props) {
  const verb = intent === 'register' ? 'Continuer avec' : 'Se connecter avec';

  const handleClick = (provider: 'google' | 'apple' | 'facebook') => {
    // Quand le backend sera pret :
    //   window.location.href = `/api/v1/client-portal/oauth/${provider}/start?intent=${intent}`;
    // Pour l'instant on previent l'utilisateur sans le laisser dans un mur.
    toast.info(
      `Authentification ${provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : 'Facebook'} bientot disponible. Utilisez le formulaire ci-dessous.`,
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => handleClick('google')}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          aria-label={`${verb} Google`}
        >
          <GoogleIcon />
          Google
        </button>
        <button
          type="button"
          onClick={() => handleClick('apple')}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-900 bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
          aria-label={`${verb} Apple`}
        >
          <AppleIcon />
          Apple
        </button>
        <button
          type="button"
          onClick={() => handleClick('facebook')}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#1877F2] bg-[#1877F2] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#1664d6]"
          aria-label={`${verb} Facebook`}
        >
          <FacebookIcon />
          Facebook
        </button>
      </div>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs uppercase tracking-wider" style={{ color: 'var(--skin-muted)' }}>
          ou par email
        </span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
    </div>
  );
}

/* Icons : inlined SVG pour eviter une dependance externe. */

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.75h3.57c2.08-1.92 3.28-4.74 3.28-8.07z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.75c-.99.66-2.26 1.05-3.71 1.05-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A10.99 10.99 0 0 0 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11c-.22-.66-.35-1.36-.35-2.11s.13-1.45.35-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.77.42 3.44 1.18 4.95l3.66-2.84z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16.365 1.43c0 1.14-.49 2.27-1.3 3.08-.84.86-2.13 1.5-3.21 1.42-.14-1.12.48-2.27 1.26-3.05.87-.88 2.27-1.55 3.25-1.45zM20.5 17.4c-.55 1.27-.83 1.84-1.55 2.96-1 1.55-2.4 3.47-4.14 3.48-1.54.02-1.94-1-4.04-.99-2.09.01-2.53.99-4.07.99-1.74-.01-3.06-1.78-4.06-3.33C.36 16.7 0 12.97 1.4 10.7c1.04-1.68 2.78-2.66 4.46-2.66 1.71 0 2.79 1 4.2 1 1.37 0 2.21-1 4.2-1 1.5 0 3.1.82 4.24 2.22-3.73 2.05-3.12 7.4-.86 9.14z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 12.07C22 6.51 17.52 2 12 2S2 6.51 2 12.07c0 5.01 3.66 9.17 8.44 9.93v-7.02H7.9v-2.91h2.54V9.84c0-2.52 1.49-3.91 3.78-3.91 1.1 0 2.24.19 2.24.19v2.47h-1.26c-1.24 0-1.63.77-1.63 1.56v1.88h2.78l-.45 2.91h-2.33V22c4.78-.76 8.43-4.92 8.43-9.93z" />
    </svg>
  );
}
