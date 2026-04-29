'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Field, TextInput, Select, SubmitButton } from '@/components/Form';

const schema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  cpuCores: z.coerce.number().min(0.25).max(64),
  memoryMb: z.coerce.number().int().min(256).max(65536),
  diskQuotaGb: z.coerce.number().int().min(1).max(2000),
  pricePerMonth: z.coerce.number().min(0),
  currency: z.enum(['XAF', 'EUR', 'USD']).default('XAF'),
  isActive: z.boolean().default(true),
});

type FormData = z.infer<typeof schema>;

export default function NewPlanPage() {
  const router = useRouter();
  const [serverErr, setServerErr] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { currency: 'XAF', isActive: true },
  });

  async function onSubmit(data: FormData) {
    setServerErr(null);
    try {
      await api.post('/plans', data);
      router.replace('/plans');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setServerErr(msg ?? 'Creation echouee');
    }
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Nouveau plan</h1>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-3 rounded-lg border bg-white p-4 shadow-sm"
      >
        <Field label="Nom" error={errors.name?.message}>
          <TextInput {...register('name')} placeholder="starter" />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <TextInput {...register('description')} placeholder="Plan de base" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="CPU" error={errors.cpuCores?.message}>
            <TextInput type="number" step="0.25" {...register('cpuCores')} />
          </Field>
          <Field label="RAM (MB)" error={errors.memoryMb?.message}>
            <TextInput type="number" {...register('memoryMb')} />
          </Field>
          <Field label="Disque (GB)" error={errors.diskQuotaGb?.message}>
            <TextInput type="number" {...register('diskQuotaGb')} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Prix / mois" error={errors.pricePerMonth?.message}>
            <TextInput type="number" {...register('pricePerMonth')} />
          </Field>
          <Field label="Devise" error={errors.currency?.message}>
            <Select {...register('currency')}>
              <option value="XAF">XAF</option>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('isActive')} />
          <span>Actif</span>
        </label>

        {serverErr && <p className="text-sm text-red-600">{serverErr}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Annuler
          </button>
          <SubmitButton loading={isSubmitting}>Creer le plan</SubmitButton>
        </div>
      </form>
    </div>
  );
}
