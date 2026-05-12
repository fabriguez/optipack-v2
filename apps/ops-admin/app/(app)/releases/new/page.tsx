'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Rocket } from 'lucide-react';
import { createReleaseSchema, type CreateReleaseInput } from '@transitsoftservices/ops-schemas';
import { api } from '@/lib/api';
import { GhcrTagSelect } from '@/components/GhcrTagSelect';

export default function NewReleasePage() {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<CreateReleaseInput>({
    resolver: zodResolver(createReleaseSchema),
    defaultValues: { isStable: false, isCritical: false },
  });

  const mutation = useMutation({
    mutationFn: (input: CreateReleaseInput) => api.post('/releases', input),
    onSuccess: (r) => {
      const id = r.data?.data?.id;
      router.replace(id ? `/releases/${id}` : '/releases');
    },
    onError: (err: unknown) => {
      const issues = (err as { response?: { data?: { issues?: Array<{ path: string[]; message: string }> } } })
        ?.response?.data?.issues;
      if (issues) {
        for (const i of issues) {
          if (i.path?.[0]) setError(i.path[0] as keyof CreateReleaseInput, { message: i.message });
        }
      }
    },
  });

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/releases" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700">
        <ArrowLeft className="h-3 w-3" /> Retour
      </Link>
      <h1 className="text-2xl font-semibold">Nouvelle release</h1>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-4 rounded-lg border bg-white p-5 shadow-sm"
      >
        <Field
          label="Version"
          hint="Selectionnez un tag publie sur GHCR (ex: beta-1.0.34). Saisie libre possible."
          error={errors.version?.message}
        >
          <Controller
            name="version"
            control={control}
            render={({ field }) => (
              <GhcrTagSelect
                image="optipack-api"
                value={field.value ?? ''}
                onChange={field.onChange}
                placeholder="Choisir une version..."
                showLatest={false}
              />
            )}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Field label="Tag image API (optionnel)" error={errors.apiImageTag?.message}>
            <Controller
              name="apiImageTag"
              control={control}
              render={({ field }) => (
                <GhcrTagSelect
                  image="optipack-api"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Auto = version"
                />
              )}
            />
          </Field>
          <Field label="Tag image Web (optionnel)" error={errors.webImageTag?.message}>
            <Controller
              name="webImageTag"
              control={control}
              render={({ field }) => (
                <GhcrTagSelect
                  image="optipack-web"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Auto = version"
                />
              )}
            />
          </Field>
          <Field label="Tag image Web-client (optionnel)" error={errors.webClientImageTag?.message}>
            <Controller
              name="webClientImageTag"
              control={control}
              render={({ field }) => (
                <GhcrTagSelect
                  image="optipack-web-client"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Auto = version"
                />
              )}
            />
          </Field>
        </div>

        <Field label="Changelog (markdown OK)" error={errors.changelog?.message}>
          <textarea
            rows={6}
            placeholder="- Nouveau X&#10;- Fix Y"
            className="w-full rounded-md border px-3 py-2 font-mono text-xs"
            {...register('changelog')}
          />
        </Field>

        <div className="flex items-center gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" {...register('isStable')} />
            <span>Stable</span>
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" {...register('isCritical')} />
            <span>Critical</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t pt-3">
          <Link href="/releases" className="rounded-md border bg-white px-3 py-1.5 text-sm hover:bg-gray-50">
            Annuler
          </Link>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-900 disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Creer la release
          </button>
        </div>
        {mutation.isError && (
          <p className="text-xs text-red-600">
            {(mutation.error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
              'Creation impossible.'}
          </p>
        )}
      </form>
    </div>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p className="mt-1 text-xs text-red-600">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-gray-400">{hint}</p>
      ) : null}
    </div>
  );
}
