'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Field, TextInput, Textarea, SubmitButton } from '@/components/Form';

const schema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.coerce.number().int().min(1).max(65535).default(22),
  username: z.string().min(1),
  sshPrivateKey: z.string().min(20),
  region: z.string().optional(),
  totalCpu: z.coerce.number().int().min(1),
  totalRamMb: z.coerce.number().int().min(512),
  totalDiskGb: z.coerce.number().int().min(10),
});

type FormData = z.infer<typeof schema>;

export default function NewVpsPage() {
  const router = useRouter();
  const [serverErr, setServerErr] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { port: 22, username: 'optipack' },
  });

  async function onSubmit(data: FormData) {
    setServerErr(null);
    try {
      const r = await api.post('/vps', data);
      const id = r.data?.data?.id ?? r.data?.id;
      router.replace(id ? `/vps/${id}` : '/vps');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setServerErr(msg ?? 'Creation echouee');
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Ajouter un VPS</h1>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 rounded-lg border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nom" error={errors.name?.message}>
            <TextInput {...register('name')} placeholder="vps-eu-1" />
          </Field>
          <Field label="Region" error={errors.region?.message}>
            <TextInput {...register('region')} placeholder="eu-west" />
          </Field>
          <Field label="Host (IP ou hostname)" error={errors.host?.message}>
            <TextInput {...register('host')} placeholder="10.0.0.1" />
          </Field>
          <Field label="Port SSH" error={errors.port?.message}>
            <TextInput type="number" {...register('port')} />
          </Field>
          <Field label="Username SSH" error={errors.username?.message}>
            <TextInput {...register('username')} />
          </Field>
        </div>
        <Field
          label="Cle SSH privee (PEM)"
          error={errors.sshPrivateKey?.message}
          hint="Chiffree en AES-256-GCM avant stockage"
        >
          <Textarea
            rows={6}
            {...register('sshPrivateKey')}
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
            className="font-mono text-xs"
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="CPU (cores)" error={errors.totalCpu?.message}>
            <TextInput type="number" {...register('totalCpu')} placeholder="4" />
          </Field>
          <Field label="RAM totale (MB)" error={errors.totalRamMb?.message}>
            <TextInput type="number" {...register('totalRamMb')} placeholder="8192" />
          </Field>
          <Field label="Disque (GB)" error={errors.totalDiskGb?.message}>
            <TextInput type="number" {...register('totalDiskGb')} placeholder="80" />
          </Field>
        </div>
        {serverErr && <p className="text-sm text-red-600">{serverErr}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50"
          >
            Annuler
          </button>
          <SubmitButton loading={isSubmitting}>Creer le VPS</SubmitButton>
        </div>
      </form>
    </div>
  );
}
