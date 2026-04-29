'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { api } from '@/lib/api';
import { Field, TextInput, SubmitButton } from '@/components/Form';

const schema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  isSuperAdmin: z.boolean().default(false),
});

type FormData = z.infer<typeof schema>;

export default function NewOpsAdminPage() {
  const router = useRouter();
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isSuperAdmin: false },
  });

  async function onSubmit(data: FormData) {
    setServerErr(null);
    try {
      const r = await api.post('/ops-admins', data);
      const pwd = r.data?.data?.initialPassword ?? r.data?.initialPassword;
      if (pwd) {
        setTempPassword(pwd);
      } else {
        router.replace('/ops-admins');
      }
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setServerErr(msg ?? 'Invitation echouee');
    }
  }

  if (tempPassword) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-semibold">Compte cree</h1>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm">
            Mot de passe initial (a transmettre via canal securise) :
          </p>
          <code className="mt-2 block rounded bg-white p-2 font-mono text-sm">
            {tempPassword}
          </code>
          <p className="mt-2 text-xs text-amber-700">
            Ce mot de passe ne sera plus affiche. L&apos;utilisateur devra le changer
            au premier login et configurer son 2FA.
          </p>
        </div>
        <button
          onClick={() => router.replace('/ops-admins')}
          className="rounded-md bg-primary-700 px-3 py-2 text-sm text-white hover:bg-primary-900"
        >
          Retour a la liste
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Inviter un ops admin</h1>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-3 rounded-lg border bg-white p-4 shadow-sm"
      >
        <Field label="Email" error={errors.email?.message}>
          <TextInput type="email" {...register('email')} />
        </Field>
        <Field label="Nom complet" error={errors.fullName?.message}>
          <TextInput {...register('fullName')} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register('isSuperAdmin')} />
          <span>Super-admin (pouvoirs etendus)</span>
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
          <SubmitButton loading={isSubmitting}>Inviter</SubmitButton>
        </div>
      </form>
    </div>
  );
}
