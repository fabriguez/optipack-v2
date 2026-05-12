'use client';
import { use, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Rocket, Save } from 'lucide-react';
import { updateReleaseSchema, type UpdateReleaseInput } from '@transitsoftservices/ops-schemas';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';

interface Release {
  id: string;
  version: string;
  changelog: string | null;
  isStable: boolean;
  isCritical: boolean;
  isPublished: boolean;
  publishedAt: string | null;
  apiImageTag: string;
  webImageTag: string;
}

export default function EditReleasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();

  const release = useQuery<Release>({
    queryKey: ['release', id],
    queryFn: async () => (await api.get(`/releases/${id}`)).data?.data,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateReleaseInput>({ resolver: zodResolver(updateReleaseSchema) });

  useEffect(() => {
    if (release.data) {
      reset({
        changelog: release.data.changelog ?? '',
        isStable: release.data.isStable,
        isCritical: release.data.isCritical,
      });
    }
  }, [release.data, reset]);

  const save = useMutation({
    mutationFn: (input: UpdateReleaseInput) => api.patch(`/releases/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['release', id] }),
  });

  const publish = useMutation({
    mutationFn: () => api.post(`/releases/${id}/publish`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['release', id] });
      qc.invalidateQueries({ queryKey: ['releases'] });
    },
  });

  if (release.isLoading) return <p className="text-sm text-gray-500">Chargement...</p>;
  if (!release.data) return <p className="text-sm text-red-600">Release introuvable.</p>;
  const r = release.data;

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/releases" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3 w-3" /> Retour
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            Release <span className="font-mono">{r.version}</span>
          </h1>
          <p className="text-xs text-gray-500">
            {r.isPublished ? `Publiee le ${formatDate(r.publishedAt)}` : 'Non publiee'}
          </p>
        </div>
        {!r.isPublished && (
          <button
            type="button"
            onClick={() => publish.mutate()}
            disabled={publish.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
          >
            {publish.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publier maintenant
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Info label="Image API tag">{r.apiImageTag}</Info>
          <Info label="Image Web tag">{r.webImageTag}</Info>
        </div>
      </div>

      <form
        onSubmit={handleSubmit((v) => save.mutate(v))}
        className="space-y-4 rounded-lg border bg-white p-5 shadow-sm"
      >
        <Field label="Changelog" error={errors.changelog?.message}>
          <textarea
            rows={8}
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
            {...register('changelog')}
          />
        </Field>

        <div className="flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" {...register('isStable')} />
            Stable
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" {...register('isCritical')} />
            Critical
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

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 font-mono">{children}</p>
    </div>
  );
}
