'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useRegister } from '@/lib/hooks/useAuth';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field } from '@/components/auth/Field';
import { SocialAuthButtons } from '@/components/auth/SocialAuthButtons';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';

const schema = z.object({
  fullName: z.string().min(2, 'Nom requis'),
  phone: z.string().min(8, 'Numero invalide'),
  email: z.string().email('Email invalide').or(z.literal('')).optional(),
  password: z.string().min(8, '8 caracteres minimum'),
  acceptTerms: z.literal(true, { errorMap: () => ({ message: 'Vous devez accepter' }) }),
});

type FormValues = z.infer<typeof schema>;

export default function RegisterPage() {
  const [showPwd, setShowPwd] = useState(false);
  const reg = useRegister();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <AuthShell
      side="right"
      imageSrc="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1400&q=70"
      badge="Inscription"
      title="Creez votre compte en 30 secondes."
      subtitle="Aucune carte bancaire requise. Vous pouvez commencer a suivre vos colis immediatement."
    >
      <SocialAuthButtons intent="register" />

      <form
        onSubmit={handleSubmit((v) =>
          reg.mutate({
            fullName: v.fullName,
            phone: v.phone,
            email: v.email || undefined,
            password: v.password,
          }),
        )}
        className="mt-6 space-y-5"
        noValidate
      >
        <Field label="Nom complet" error={errors.fullName?.message}>
          <input
            type="text"
            autoComplete="name"
            placeholder="Marie Dupont"
            className="skin-input"
            {...register('fullName')}
          />
        </Field>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Telephone" error={errors.phone?.message}>
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <AppPhoneInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="+237 6XX XXX XXX"
                  error={errors.phone?.message}
                />
              )}
            />
          </Field>
          <Field
            label="Email"
            error={errors.email?.message}
            hint="Optionnel - utilise pour les notifications"
          >
            <input
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              className="skin-input"
              {...register('email')}
            />
          </Field>
        </div>

        <Field
          label="Mot de passe"
          error={errors.password?.message}
          hint="Au moins 8 caracteres"
        >
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="********"
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

        <label
          className="flex items-start gap-2 text-xs"
          style={{ color: 'var(--skin-muted)' }}
        >
          <input
            type="checkbox"
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            {...register('acceptTerms')}
          />
          <span>
            J&apos;accepte les{' '}
            <Link
              href="/cgv"
              target="_blank"
              className="font-semibold underline"
              style={{ color: 'var(--skin-primary)' }}
            >
              conditions generales
            </Link>{' '}
            et la{' '}
            <Link
              href="/privacy"
              target="_blank"
              className="font-semibold underline"
              style={{ color: 'var(--skin-primary)' }}
            >
              politique de confidentialite
            </Link>
            .
          </span>
        </label>
        {errors.acceptTerms && (
          <p className="-mt-3 text-xs font-medium" style={{ color: '#dc2626' }}>
            {errors.acceptTerms.message}
          </p>
        )}

        <button
          type="submit"
          disabled={reg.isPending}
          className="inline-flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold skin-btn-primary"
        >
          {reg.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Creer mon compte
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-sm" style={{ color: 'var(--skin-muted)' }}>
          Deja un compte ?{' '}
          <Link
            href="/login"
            className="font-semibold transition-opacity hover:opacity-80"
            style={{ color: 'var(--skin-primary)' }}
          >
            Connectez-vous
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
