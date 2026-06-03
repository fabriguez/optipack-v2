'use client';

import { Suspense } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/lib/api/client';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field } from '@/components/auth/Field';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';

const schema = z
  .object({
    phone: z.string().min(8, 'Numero invalide'),
    code: z.string().regex(/^\d{6}$/, 'Le code doit contenir 6 chiffres'),
    newPassword: z.string().min(6, '6 caracteres minimum'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

type FormValues = z.infer<typeof schema>;

function ResetPasswordInner() {
  const router = useRouter();
  const params = useSearchParams();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { phone: params.get('phone') ?? '' },
  });

  const onSubmit = async (v: FormValues) => {
    try {
      await portalApi.resetPassword({
        phone: v.phone,
        code: v.code,
        newPassword: v.newPassword,
      });
      toast.success('Mot de passe reinitialise. Connectez-vous.');
      router.push('/login');
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur. Reessayez.');
    }
  };

  return (
    <AuthShell
      side="left"
      badge="Reinitialisation"
      title="Definissez un nouveau mot de passe."
      subtitle="Saisissez le code recu par SMS puis votre nouveau mot de passe."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
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

        <Field label="Code de verification" error={errors.code?.message}>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="skin-input tracking-[0.4em]"
            {...register('code')}
          />
        </Field>

        <Field label="Nouveau mot de passe" error={errors.newPassword?.message}>
          <input type="password" autoComplete="new-password" placeholder="Min. 6 caracteres" className="skin-input" {...register('newPassword')} />
        </Field>

        <Field label="Confirmer" error={errors.confirmPassword?.message}>
          <input type="password" autoComplete="new-password" placeholder="Repetez le mot de passe" className="skin-input" {...register('confirmPassword')} />
        </Field>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold skin-btn-primary"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Reinitialiser
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-sm" style={{ color: 'var(--skin-muted)' }}>
          <Link href="/forgot-password" className="font-semibold transition-opacity hover:opacity-80" style={{ color: 'var(--skin-primary)' }}>
            Renvoyer un code
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
