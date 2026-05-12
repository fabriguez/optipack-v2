'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Loader2,
  QrCode,
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

      {!m.twoFactorEnabled && <TwoFactorSetupSection />}

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

function TwoFactorSetupSection() {
  const qc = useQueryClient();
  const [step, setStep] = useState<'idle' | 'qr' | 'confirm' | 'done'>('idle');
  const [qr, setQr] = useState<{ qrCodeDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  const setup = useMutation({
    mutationFn: () => api.post('/auth/2fa/self-setup'),
    onSuccess: (r) => {
      setQr({
        qrCodeDataUrl: r.data?.data?.qrCodeDataUrl,
        secret: r.data?.data?.secret,
      });
      setStep('qr');
    },
  });

  const confirm = useMutation({
    mutationFn: (totpCode: string) => api.post('/auth/2fa/self-confirm', { totpCode }),
    onSuccess: (r) => {
      setCodes(r.data?.data?.recoveryCodes ?? null);
      setStep('done');
      qc.invalidateQueries({ queryKey: ['me'] });
    },
  });

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h2 className="flex items-center gap-2 text-base font-semibold text-amber-900">
        <ShieldAlert className="h-4 w-4" /> Activer la double authentification (2FA)
      </h2>
      <p className="mt-1 text-xs text-amber-800">
        Recommande pour tout super admin. Scanne le QR code avec Google Authenticator,
        Authy ou 1Password, puis valide avec un code a 6 chiffres.
      </p>

      {step === 'idle' && (
        <button
          type="button"
          onClick={() => setup.mutate()}
          disabled={setup.isPending}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {setup.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <QrCode className="h-4 w-4" />
          )}
          Configurer maintenant
        </button>
      )}

      {step === 'qr' && qr && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col items-center gap-3 rounded-md border border-amber-200 bg-white p-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qr.qrCodeDataUrl}
              alt="QR code 2FA"
              className="h-48 w-48 rounded border"
            />
            <div className="flex-1 space-y-2">
              <p className="text-xs text-amber-800">
                Si tu ne peux pas scanner, saisis ce secret manuellement :
              </p>
              <code className="block break-all rounded bg-amber-50 px-2 py-1 font-mono text-xs">
                {qr.secret}
              </code>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800"
              >
                J&apos;ai scanne, etape suivante
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            confirm.mutate(code);
          }}
          className="mt-3 space-y-3"
        >
          <Field label="Code a 6 chiffres affiche par l'application">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-32 rounded-md border px-3 py-2 text-center font-mono text-lg"
              placeholder="123456"
            />
          </Field>
          {confirm.isError && (
            <p className="text-xs text-red-600">
              {(confirm.error as { response?: { data?: { message?: string } } })?.response?.data
                ?.message ?? 'Code invalide.'}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={confirm.isPending || code.length !== 6}
              className="inline-flex items-center gap-1.5 rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {confirm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Activer la 2FA
            </button>
            <button
              type="button"
              onClick={() => setStep('qr')}
              className="text-xs text-amber-700 underline hover:text-amber-900"
            >
              Retour au QR
            </button>
          </div>
        </form>
      )}

      {step === 'done' && codes && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <p className="flex items-center gap-1 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="h-4 w-4" /> 2FA activee !
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-800">
            Sauvegarde ces codes de recuperation maintenant (ils ne seront plus affiches) :
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-emerald-900">
            {codes.map((c) => (
              <li key={c} className="rounded bg-white px-2 py-1">{c}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(codes.join('\n'))}
            className="mt-3 text-xs text-emerald-800 underline hover:text-emerald-900"
          >
            Copier dans le presse-papier
          </button>
        </div>
      )}
    </section>
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
