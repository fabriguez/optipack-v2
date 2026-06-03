'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useLogin } from '@/lib/hooks/useAuth';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field } from '@/components/auth/Field';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';

const schema = z.object({
  identifier: z.string().min(4, 'Telephone ou email requis'),
  password: z.string().min(6, '6 caracteres minimum'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const [showPwd, setShowPwd] = useState(false);
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <AuthShell
      side="left"
      badge="Connexion"
      title="Bon retour parmi nous."
      subtitle="Entrez votre telephone ou email et votre mot de passe pour reprendre la ou vous en etiez."
    >
      <SocialAuthButtons intent="login" />

      <form
        onSubmit={handleSubmit((v) => login.mutate(v))}
        className="mt-6 space-y-5"
        noValidate
      >
        <Field label="Telephone ou email" error={errors.identifier?.message}>
          <input
            type="text"
            autoComplete="username"
            inputMode="text"
            placeholder="+237 6XX XXX XXX  ou  vous@exemple.com"
            className="skin-input"
            {...register('identifier')}
          />
        </Field>

        <Field label="Mot de passe" error={errors.password?.message}>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Votre mot de passe"
              className="skin-input pr-11"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPwd((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1"
              style={{ color: 'var(--skin-muted)' }}
              aria-label={showPwd ? 'Masquer' : 'Afficher'}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <div className="flex items-center justify-between text-xs">
          <label className="flex items-center gap-2" style={{ color: 'var(--skin-muted)' }}>
            <input type="checkbox" className="h-3.5 w-3.5" />
            Se souvenir de moi
          </label>
          <Link
            href="/forgot-password"
            className="font-semibold transition-opacity hover:opacity-80"
            style={{ color: 'var(--skin-primary)' }}
          >
            Mot de passe oublie ?
          </Link>
        </div>

        <button
          type="submit"
          disabled={login.isPending}
          className="inline-flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold skin-btn-primary"
        >
          {login.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Se connecter
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-sm" style={{ color: 'var(--skin-muted)' }}>
          Pas encore de compte ?{' '}
          <Link
            href="/register"
            className="font-semibold transition-opacity hover:opacity-80"
            style={{ color: 'var(--skin-primary)' }}
          >
            Creez-en un en 30s
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
