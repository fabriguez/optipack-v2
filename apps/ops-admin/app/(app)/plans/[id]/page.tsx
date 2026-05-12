'use client';
import { use, useEffect } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save, Trash2 } from 'lucide-react';
import { updatePlanSchema, type UpdatePlanInput } from '@transitsoftservices/ops-schemas';
import { api } from '@/lib/api';

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  pricePerMonth: number;
  currency: string;
  cpuLimit: number;
  memoryMb: number;
  diskQuotaGb: number;
  maxParcelsPerMonth: number | null;
  maxUsers: number | null;
  isPublic: boolean;
  sortOrder: number;
  isActive: boolean;
}

export default function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();

  const plan = useQuery<Plan>({
    queryKey: ['plan', id],
    queryFn: async () => (await api.get(`/plans/${id}`)).data?.data,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdatePlanInput>({ resolver: zodResolver(updatePlanSchema) });

  useEffect(() => {
    if (plan.data) {
      reset({
        name: plan.data.name,
        description: plan.data.description ?? undefined,
        pricePerMonth: plan.data.pricePerMonth,
        currency: plan.data.currency,
        cpuLimit: plan.data.cpuLimit,
        memoryMb: plan.data.memoryMb,
        diskQuotaGb: plan.data.diskQuotaGb,
        maxParcelsPerMonth: plan.data.maxParcelsPerMonth ?? undefined,
        maxUsers: plan.data.maxUsers ?? undefined,
        isPublic: plan.data.isPublic,
        sortOrder: plan.data.sortOrder,
      });
    }
  }, [plan.data, reset]);

  const save = useMutation({
    mutationFn: (input: UpdatePlanInput) => api.patch(`/plans/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', id] }),
  });

  const deactivate = useMutation({
    mutationFn: () => api.post(`/plans/${id}/deactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['plan', id] }),
  });

  if (plan.isLoading) return <p className="text-sm text-gray-500">Chargement...</p>;
  if (!plan.data) return <p className="text-sm text-red-600">Plan introuvable.</p>;
  const p = plan.data;

  return (
    <div className="max-w-3xl space-y-4">
      <Link href="/plans" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3 w-3" /> Retour
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Plan <span className="font-mono">{p.code}</span>
          </h1>
          <p className="text-xs text-gray-500">{p.isActive ? 'Actif' : 'Inactif'}</p>
        </div>
        {p.isActive && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Desactiver le plan ${p.code} ? Les tenants existants gardent ce plan mais aucun nouveau ne pourra le choisir.`)) {
                deactivate.mutate();
              }
            }}
            disabled={deactivate.isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" /> Desactiver
          </button>
        )}
      </div>

      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="space-y-4 rounded-lg border bg-white p-5 shadow-sm"
      >
        <Field label="Nom affiche" error={errors.name?.message}>
          <input type="text" className="w-full rounded-md border px-3 py-2 text-sm" {...register('name')} />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <textarea rows={2} className="w-full rounded-md border px-3 py-2 text-sm" {...register('description')} />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="CPU (cores)" error={errors.cpuLimit?.message}>
            <input
              type="number"
              step="0.1"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('cpuLimit', { valueAsNumber: true })}
            />
          </Field>
          <Field label="RAM (Mo)" error={errors.memoryMb?.message}>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('memoryMb', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Disque (Go)" error={errors.diskQuotaGb?.message}>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('diskQuotaGb', { valueAsNumber: true })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix / mois" error={errors.pricePerMonth?.message}>
            <input
              type="number"
              step="0.01"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('pricePerMonth', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Devise" error={errors.currency?.message}>
            <input type="text" maxLength={4} className="w-full rounded-md border px-3 py-2 text-sm uppercase" {...register('currency')} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Max colis / mois (optionnel)" error={errors.maxParcelsPerMonth?.message}>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('maxParcelsPerMonth', { valueAsNumber: true })}
            />
          </Field>
          <Field label="Max utilisateurs (optionnel)" error={errors.maxUsers?.message}>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('maxUsers', { valueAsNumber: true })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('isPublic')} /> Visible publiquement
          </label>
          <Field label="Ordre d'affichage" error={errors.sortOrder?.message}>
            <input
              type="number"
              className="w-full rounded-md border px-3 py-2 text-sm"
              {...register('sortOrder', { valueAsNumber: true })}
            />
          </Field>
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
