'use client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Field, TextInput, Select, SubmitButton } from '@/components/Form';

const ALL_MODULES = [
  'parcels',
  'clients',
  'containers',
  'warehouses',
  'agencies',
  'invoices',
  'payments',
  'expenses',
  'disbursements',
  'fund-transfers',
  'penalties',
  'employees',
  'reports',
  'chat',
  'accounting',
  'loyalty',
  'transit-routes',
];

const schema = z.object({
  slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, 'lowercase + tirets uniquement'),
  name: z.string().min(2),
  ownerEmail: z.string().email(),
  ownerUsername: z.string().min(2),
  vpsId: z.string().uuid(),
  resourcePlanId: z.string().uuid(),
  customDomain: z.string().optional().or(z.literal('')),
  primaryColor: z.string().default('#1B5E20'),
  secondaryColor: z.string().default('#4CAF50'),
});

type FormData = z.infer<typeof schema>;

interface Vps {
  id: string;
  name: string;
  status: string;
}
interface Plan {
  id: string;
  name: string;
  pricePerMonth: string;
}

export default function NewTenantPage() {
  const router = useRouter();
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [modules, setModules] = useState<string[]>(ALL_MODULES);

  const vps = useQuery({
    queryKey: ['vps'],
    queryFn: async (): Promise<Vps[]> => (await api.get('/vps')).data?.data ?? [],
  });
  const plans = useQuery({
    queryKey: ['plans'],
    queryFn: async (): Promise<Plan[]> => (await api.get('/plans')).data?.data ?? [],
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      primaryColor: '#1B5E20',
      secondaryColor: '#4CAF50',
    },
  });

  function toggleModule(m: string) {
    setModules((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]));
  }

  async function onSubmit(data: FormData) {
    setServerErr(null);
    try {
      const r = await api.post('/tenants', {
        ...data,
        customDomain: data.customDomain || null,
        enabledModules: modules,
      });
      const id = r.data?.data?.id ?? r.data?.id;
      router.replace(id ? `/tenants/${id}` : '/tenants');
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setServerErr(msg ?? 'Creation echouee');
    }
  }

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Nouveau tenant</h1>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4 rounded-lg border bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Slug" error={errors.slug?.message} hint="ex: acme -> acme.transitsoftservices.com">
            <TextInput {...register('slug')} placeholder="acme" />
          </Field>
          <Field label="Nom commercial" error={errors.name?.message}>
            <TextInput {...register('name')} placeholder="ACME Transit" />
          </Field>
          <Field label="Email du proprietaire" error={errors.ownerEmail?.message}>
            <TextInput type="email" {...register('ownerEmail')} />
          </Field>
          <Field label="Username initial" error={errors.ownerUsername?.message}>
            <TextInput {...register('ownerUsername')} placeholder="admin" />
          </Field>
          <Field label="VPS" error={errors.vpsId?.message}>
            <Select {...register('vpsId')}>
              <option value="">-- Choisir --</option>
              {(vps.data ?? []).map((v) => (
                <option key={v.id} value={v.id} disabled={v.status !== 'ACTIVE'}>
                  {v.name} ({v.status})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plan de ressources" error={errors.resourcePlanId?.message}>
            <Select {...register('resourcePlanId')}>
              <option value="">-- Choisir --</option>
              {(plans.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.pricePerMonth} / mois)
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Custom domain (optionnel)"
            error={errors.customDomain?.message}
            hint="ex: app.acme.com"
          >
            <TextInput {...register('customDomain')} placeholder="" />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Couleur primaire" error={errors.primaryColor?.message}>
            <TextInput type="color" {...register('primaryColor')} className="h-10 p-1" />
          </Field>
          <Field label="Couleur secondaire" error={errors.secondaryColor?.message}>
            <TextInput type="color" {...register('secondaryColor')} className="h-10 p-1" />
          </Field>
        </div>

        <div>
          <span className="text-xs text-gray-600">Modules actives</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {ALL_MODULES.map((m) => {
              const active = modules.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleModule(m)}
                  className={
                    'rounded-full border px-2 py-0.5 text-xs ' +
                    (active
                      ? 'border-primary-700 bg-primary-50 text-primary-900'
                      : 'border-gray-300 text-gray-500 hover:bg-gray-50')
                  }
                >
                  {m}
                </button>
              );
            })}
          </div>
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
          <SubmitButton loading={isSubmitting}>Provisionner</SubmitButton>
        </div>
      </form>
    </div>
  );
}
