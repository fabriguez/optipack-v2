'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSearchParams } from 'next/navigation';
import { loginSchema, type LoginInput } from '@transitsoftservices/shared';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';
import { useLogin } from '@/lib/hooks/useAuth';
import { readAuthLog, clearAuthLog, type AuthDebugEntry } from '@/lib/api/authDebug';
import { useTenantMeta } from '@/lib/providers/TenantProvider';

const REASON_LABELS: Record<string, string> = {
  'refresh-failed': "Votre session a expire (refresh token invalide).",
  'refresh-exception': 'Erreur reseau pendant le rafraichissement de la session.',
  'repeated-401-after-refresh': 'Le serveur a refuse plusieurs requetes successives.',
  'session-unauthenticated':
    "Votre session a ete invalidee par NextAuth (cookie expire ou supprime). Consultez le journal ci-dessous.",
};

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [authLog, setAuthLog] = useState<AuthDebugEntry[]>([]);
  const search = useSearchParams();
  const reason = search.get('reason');
  const loginMutation = useLogin();
  const { meta } = useTenantMeta();
  const orgName = meta?.name?.trim() || 'TransitSoftServices';
  const logoUrl = meta?.logoUrl ?? null;

  useEffect(() => {
    if (reason) setAuthLog(readAuthLog());
  }, [reason]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginInput) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        {/* Logo + nom dynamique tenant */}
        <div className="mb-8 text-center">
          {logoUrl && /^https?:\/\//.test(logoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={orgName}
              className="mx-auto mb-4 h-16 w-16 rounded-2xl object-contain"
            />
          ) : (
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-500">
              <span className="text-2xl font-bold text-white">
                {orgName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{orgName}</h1>
          <p className="mt-1 text-sm text-gray-500">Connectez-vous a votre compte</p>
        </div>

        {/* Form */}
        <div className="rounded-2xl bg-white p-8 shadow-card border border-gray-100">
          {/* Bandeau diagnostique : explique pourquoi l'utilisateur a ete deconnecte
              et expose les logs persistants pour investigation. */}
          {reason && (
            <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-700 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-amber-800 font-medium">
                    Vous avez ete deconnecte
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    {REASON_LABELS[reason] ?? `Raison: ${reason}`}
                  </p>
                  {authLog.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowLog((s) => !s)}
                      className="mt-1 text-xs text-amber-800 underline hover:text-amber-900"
                    >
                      {showLog ? 'Masquer' : 'Afficher'} le journal ({authLog.length} evenement{authLog.length > 1 ? 's' : ''})
                    </button>
                  )}
                  {showLog && (
                    <div className="mt-2 max-h-48 overflow-auto rounded bg-white border border-amber-200 p-2 font-mono text-[10px] text-gray-700">
                      {authLog.slice().reverse().map((e, i) => (
                        <div key={i} className="border-b border-gray-100 py-0.5 last:border-0">
                          <span className="text-gray-400">{e.ts.slice(11, 19)}</span>{' '}
                          <span className="font-semibold">{e.kind}</span>{' '}
                          {e.detail && <span className="text-gray-500">{JSON.stringify(e.detail)}</span>}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          clearAuthLog();
                          setAuthLog([]);
                        }}
                        className="mt-1 text-amber-700 hover:underline"
                      >
                        Effacer le journal
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Erreur globale */}
          {loginMutation.isError && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
              <p className="text-sm text-red-700">{loginMutation.error.message}</p>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <AppInput
              label="Email"
              type="email"
              placeholder="votre@email.com"
              {...register('email')}
              error={errors.email?.message}
              disabled={loginMutation.isPending}
            />

            {/* Password with toggle */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  {...register('password')}
                  disabled={loginMutation.isPending}
                  className="h-11 w-full rounded-xl border border-gray-300 bg-white px-4 pr-11 text-sm outline-none transition-colors focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="Votre mot de passe"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500">{errors.password.message}</p>
              )}
              <a href="/forgot-password" className="text-xs text-primary-700 hover:underline">
                Mot de passe oublie ?
              </a>
            </div>

            <AppButton
              type="submit"
              className="w-full"
              loading={loginMutation.isPending}
              disabled={loginMutation.isPending}
            >
              <LogIn className="h-4 w-4" />
              {loginMutation.isPending ? 'Connexion en cours...' : 'Se connecter'}
            </AppButton>
          </form>
        </div>
        <p className="mt-6 text-center text-xs text-gray-400">
          Powered by{' '}
          <a
            href="https://transitsoftservices.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary-700 hover:underline"
          >
            transitsoftservices.com
          </a>
        </p>
      </div>
    </div>
  );
}
