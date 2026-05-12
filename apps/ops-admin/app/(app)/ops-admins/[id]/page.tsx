'use client';
import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, Loader2, Save, ShieldAlert, ShieldCheck } from 'lucide-react';
import { updateOpsAdminSchema, type UpdateOpsAdminInput } from '@transitsoftservices/ops-schemas';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface OpsAdmin {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export default function EditOpsAdminPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const [confirmReset2fa, setConfirmReset2fa] = useState(false);

  const admin = useQuery<OpsAdmin>({
    queryKey: ['ops-admin', id],
    queryFn: async () => (await api.get(`/ops-admins/${id}`)).data?.data,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateOpsAdminInput>({ resolver: zodResolver(updateOpsAdminSchema) });

  useEffect(() => {
    if (admin.data) {
      reset({
        fullName: admin.data.fullName,
        isActive: admin.data.isActive,
        isSuperAdmin: admin.data.isSuperAdmin,
      });
    }
  }, [admin.data, reset]);

  const save = useMutation({
    mutationFn: (input: UpdateOpsAdminInput) => api.patch(`/ops-admins/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ops-admin', id] }),
  });

  const reset2fa = useMutation({
    mutationFn: () => api.post(`/ops-admins/${id}/reset-2fa`),
    onSuccess: () => {
      setConfirmReset2fa(false);
      qc.invalidateQueries({ queryKey: ['ops-admin', id] });
    },
  });

  if (admin.isLoading) return <p className="text-sm text-gray-500">Chargement...</p>;
  if (!admin.data) return <p className="text-sm text-red-600">Admin introuvable.</p>;
  const a = admin.data;

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/ops-admins" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3 w-3" /> Retour
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{a.fullName}</h1>
          <p className="text-sm text-gray-500">{a.email}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {a.isSuperAdmin && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 font-bold text-amber-700">
              <ShieldAlert className="h-3 w-3" /> Super admin
            </span>
          )}
          <span
            className={
              'inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold ' +
              (a.twoFactorEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')
            }
          >
            {a.twoFactorEnabled ? <ShieldCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
            2FA {a.twoFactorEnabled ? 'active' : 'desactivee'}
          </span>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <p className="uppercase tracking-wide text-gray-500">Cree le</p>
            <p className="mt-0.5">{formatDate(a.createdAt)}</p>
          </div>
          <div>
            <p className="uppercase tracking-wide text-gray-500">Dernier login</p>
            <p className="mt-0.5">{formatDate(a.lastLoginAt)}</p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="space-y-4 rounded-lg border bg-white p-5 shadow-sm"
      >
        <Field label="Nom complet" error={errors.fullName?.message}>
          <input type="text" className="w-full rounded-md border px-3 py-2 text-sm" {...register('fullName')} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} /> Compte actif
          </label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isSuperAdmin')} /> Super admin
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <button
            type="submit"
            disabled={!isDirty || save.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
          >
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Enregistrer
          </button>
        </div>
        {save.isError && (
          <p className="text-xs text-red-600">
            {(save.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'Echec de sauvegarde.'}
          </p>
        )}
      </form>

      <div className="rounded-lg border border-red-100 bg-red-50/30 p-4">
        <h2 className="text-sm font-semibold text-red-700">Zone sensible</h2>
        <p className="mt-1 text-xs text-red-600">
          Reset le secret 2FA. L'admin devra reconfigurer son authenticator au prochain login.
        </p>
        <button
          type="button"
          onClick={() => setConfirmReset2fa(true)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
        >
          <KeyRound className="h-4 w-4" />
          Reset 2FA
        </button>
      </div>

      <ConfirmDialog
        open={confirmReset2fa}
        onCancel={() => setConfirmReset2fa(false)}
        title={`Reset 2FA pour ${a.email} ?`}
        description="L'admin sera force de reconfigurer son authenticator au prochain login. Les codes de recuperation existants seront invalides."
        destructive
        confirmLabel="Reset"
        loading={reset2fa.isPending}
        onConfirm={() => reset2fa.mutate()}
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
