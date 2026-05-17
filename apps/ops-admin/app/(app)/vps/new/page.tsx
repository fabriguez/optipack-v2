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
  // CPU/RAM/Disque sont auto-probed via SSH (nproc + /proc/meminfo + df)
  // au moment de la creation. Plus besoin de les saisir manuellement.
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
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          Les specs hardware (CPU, RAM, disque) sont detectees automatiquement
          via SSH a la creation (<code>nproc</code>, <code>/proc/meminfo</code>,
          <code>df</code>). Aucune saisie manuelle requise.
        </div>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
          <p className="font-semibold">VPS self (meme machine que l&apos;orchestrator)</p>
          <p>
            Host : <code>127.0.0.1</code>. Pre-requis sur la machine host :
          </p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>
              <code>sshd</code> actif sur le port choisi (<code>systemctl status ssh</code>)
            </li>
            <li>
              User dedie (ex: <code>optipack</code>) avec acces SSH par cle (la pub correspondant a
              la cle privee saisie ici doit etre dans <code>~/.ssh/authorized_keys</code>)
            </li>
            <li>
              Sudo <strong>NOPASSWD</strong> pour ce user :<br/>
              <code className="text-[10px]">echo &quot;optipack ALL=(ALL) NOPASSWD: ALL&quot; | sudo tee /etc/sudoers.d/optipack</code>
            </li>
            <li>
              Docker + Caddy installes (sinon utiliser <code>POST /vps/:id/bootstrap</code> apres
              creation)
            </li>
          </ul>
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
