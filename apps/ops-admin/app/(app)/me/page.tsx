'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface Me {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
    newPassword: z.string().min(10, '10 caracteres minimum'),
    confirmPassword: z.string().min(10),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

export default function MePage() {
  const qc = useQueryClient();
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [pwdSuccess, setPwdSuccess] = useState(false);

  const me = useQuery<Me>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data?.data,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  const changePwd = useMutation({
    mutationFn: (input: PasswordFormValues) => api.post('/auth/change-password', input),
    onSuccess: () => {
      reset();
      setPwdSuccess(true);
      setTimeout(() => setPwdSuccess(false), 5000);
    },
  });

  const regen = useMutation({
    mutationFn: () => api.post('/auth/2fa/recovery/regenerate'),
    onSuccess: (r) => {
      setRecoveryCodes(r.data?.data?.recoveryCodes ?? null);
      setConfirmRegen(false);
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  if (me.isLoading) return <p className="text-sm text-gray-500">Chargement...</p>;
  if (!me.data) return <p className="text-sm text-red-600">Erreur de chargement.</p>;
  const m = me.data;

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Mon compte</h1>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-50 text-primary-700">
            <User className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <p className="text-base font-semibold">{m.fullName}</p>
            <p className="text-sm text-gray-500">{m.email}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              {m.isSuperAdmin && (
                <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-700">
                  <ShieldAlert className="h-3 w-3" /> Super admin
                </span>
              )}
              <span
                className={
                  'inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold ' +
                  (m.twoFactorEnabled
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-red-100 text-red-700')
                }
              >
                {m.twoFactorEnabled ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                2FA {m.twoFactorEnabled ? 'active' : 'desactivee'}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="uppercase tracking-wide text-gray-500">Cree le</p>
                <p className="mt-0.5">{formatDate(m.createdAt)}</p>
              </div>
              <div>
                <p className="uppercase tracking-wide text-gray-500">Dernier login</p>
                <p className="mt-0.5">{formatDate(m.lastLoginAt)}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <KeyRound className="h-4 w-4" /> Mot de passe
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          10 caracteres minimum. On recommande un gestionnaire de mots de passe.
        </p>
        <form onSubmit={handleSubmit((v) => changePwd.mutate(v))} className="mt-4 space-y-3">
          <Field label="Mot de passe actuel" error={errors.currentPassword?.message}>
            <input
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('currentPassword')}
            />
          </Field>
          <Field label="Nouveau mot de passe" error={errors.newPassword?.message}>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('newPassword')}
            />
          </Field>
          <Field label="Confirmer le nouveau" error={errors.confirmPassword?.message}>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('confirmPassword')}
            />
          </Field>
          <div className="flex items-center justify-between">
            {changePwd.isError && (
              <p className="text-xs text-red-600">
                {(changePwd.error as { response?: { data?: { message?: string } } })?.response?.data
                  ?.message ?? 'Echec du changement.'}
              </p>
            )}
            {pwdSuccess && (
              <p className="text-xs text-emerald-600">Mot de passe mis a jour.</p>
            )}
            <button
              type="submit"
              disabled={changePwd.isPending}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
            >
              {changePwd.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
              Changer
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <RefreshCw className="h-4 w-4" /> Codes de recuperation 2FA
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          Si tu perds ton authenticator, ces codes te permettent de te connecter.
          Chaque code est utilisable une seule fois. Regenerer invalide les anciens.
        </p>
        <button
          type="button"
          onClick={() => setConfirmRegen(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Regenerer 10 nouveaux codes
        </button>

        {recoveryCodes && (
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-800">
              Sauvegarde ces codes maintenant (ils ne seront plus affiches) :
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-amber-900">
              {recoveryCodes.map((c) => (
                <li key={c} className="rounded bg-white px-2 py-1">{c}</li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(recoveryCodes.join('\n'));
              }}
              className="mt-3 text-xs text-amber-800 underline hover:text-amber-900"
            >
              Copier dans le presse-papier
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmRegen}
        onCancel={() => setConfirmRegen(false)}
        title="Regenerer les codes de recuperation ?"
        description="Les codes actuels seront immediatement invalides. Tu dois sauvegarder les nouveaux codes immediatement apres."
        destructive
        confirmLabel="Regenerer"
        loading={regen.isPending}
        onConfirm={() => regen.mutate()}
      />
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
