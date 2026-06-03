'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/lib/api/client';
import { AuthShell } from '@/components/auth/AuthShell';
import { Field } from '@/components/auth/Field';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';

const schema = z.object({
  phone: z.string().min(8, 'Numero invalide'),
});

type FormValues = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async (v: FormValues) => {
    try {
      await portalApi.forgotPassword(v.phone);
      toast.success('Si le compte existe, un code a ete envoye par SMS.');
      router.push(`/reset-password?phone=${encodeURIComponent(v.phone)}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur. Reessayez.');
    }
  };

  return (
    <AuthShell
      side="left"
      badge="Mot de passe oublie"
      title="On vous renvoie en selle."
      subtitle="Entrez votre numero, nous vous envoyons un code de verification."
    >
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
        <Field label="Telephone" error={errors.phone?.message} hint="Code valable 10 minutes (SMS, repli email).">
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold skin-btn-primary"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Envoyer le code
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>

        <p className="text-center text-sm" style={{ color: 'var(--skin-muted)' }}>
          <Link
            href="/login"
            className="font-semibold transition-opacity hover:opacity-80"
            style={{ color: 'var(--skin-primary)' }}
          >
            Retour a la connexion
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
