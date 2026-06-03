'use client';

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Loader2, Package, MapPin, User } from 'lucide-react';
import { toast } from 'sonner';
import { portalApi } from '@/lib/api/client';
import { Field } from '@/components/auth/Field';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';

const schema = z.object({
  description: z.string().min(2, 'Decrivez votre colis'),
  weight: z.coerce.number().min(0.1, 'Poids invalide'),
  serviceType: z.enum(['STANDARD', 'EXPRESS', 'SAME_DAY']).default('STANDARD'),
  receiverName: z.string().min(2, 'Nom requis'),
  receiverPhone: z.string().min(8, 'Numero invalide'),
  receiverCity: z.string().min(2, 'Ville requise'),
  receiverAddress: z.string().optional(),
  senderCity: z.string().min(2, 'Ville requise'),
});

type FormValues = z.infer<typeof schema>;

const SERVICES = [
  { id: 'STANDARD', name: 'Standard', desc: '3 a 5 jours' },
  { id: 'EXPRESS', name: 'Express', desc: '24 a 48h' },
  { id: 'SAME_DAY', name: 'Jour meme', desc: 'Avant 18h' },
] as const;

export default function NewParcelPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { serviceType: 'STANDARD' },
  });

  const serviceType = watch('serviceType');

  const mutation = useMutation({
    mutationFn: (v: FormValues) => portalApi.registerParcel(v),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['portal'] });
      toast.success('Colis enregistre.');
      router.replace('/app/parcels');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || 'Impossible d\'enregistrer le colis.');
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <p
          className="text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Nouvel envoi
        </p>
        <h1
          className="mt-1 text-3xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          Declarez votre colis.
        </h1>
        <p
          className="mt-1 text-sm"
          style={{ color: 'var(--skin-muted)' }}
        >
          Remplissez les trois sections ci-dessous. On vous envoie ensuite un
          code de suivi par SMS.
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="space-y-6"
        noValidate
      >
        <Section title="Le colis" Icon={Package}>
          <Field label="Description" error={errors.description?.message}>
            <input
              type="text"
              placeholder="Ex : 2 paires de chaussures, 1 sac"
              className="skin-input"
              {...register('description')}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Poids estime (kg)" error={errors.weight?.message}>
              <input
                type="number"
                step="0.1"
                min="0.1"
                placeholder="Ex : 1.5"
                className="skin-input"
                {...register('weight')}
              />
            </Field>
            <Field label="Vitesse">
              <div className="grid grid-cols-3 gap-2">
                {SERVICES.map((s) => {
                  const active = serviceType === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setValue('serviceType', s.id, { shouldValidate: true })}
                      className="rounded-lg px-2 py-2 text-left transition-colors"
                      style={{
                        background: active
                          ? 'color-mix(in oklab, var(--skin-primary) 12%, transparent)'
                          : 'transparent',
                        border: `1px solid ${active ? 'var(--skin-primary)' : 'var(--skin-border)'}`,
                      }}
                    >
                      <p
                        className="text-xs font-semibold"
                        style={{ color: 'var(--skin-foreground)' }}
                      >
                        {s.name}
                      </p>
                      <p
                        className="text-[10px]"
                        style={{ color: 'var(--skin-muted)' }}
                      >
                        {s.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Depart" Icon={MapPin}>
          <Field label="Ville d'enlevement" error={errors.senderCity?.message}>
            <input
              type="text"
              placeholder="Ex : Yaounde"
              className="skin-input"
              {...register('senderCity')}
            />
          </Field>
        </Section>

        <Section title="Destinataire" Icon={User}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nom complet" error={errors.receiverName?.message}>
              <input
                type="text"
                placeholder="Marie Kamga"
                className="skin-input"
                {...register('receiverName')}
              />
            </Field>
            <Field label="Telephone" error={errors.receiverPhone?.message}>
              <Controller
                control={control}
                name="receiverPhone"
                render={({ field }) => (
                  <AppPhoneInput
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="+237 6XX XXX XXX"
                    error={errors.receiverPhone?.message}
                  />
                )}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Ville" error={errors.receiverCity?.message}>
              <input
                type="text"
                placeholder="Douala"
                className="skin-input"
                {...register('receiverCity')}
              />
            </Field>
            <Field
              label="Adresse precise"
              hint="Optionnel - aide le coursier"
            >
              <input
                type="text"
                placeholder="Akwa, rue de la mosquee"
                className="skin-input"
                {...register('receiverAddress')}
              />
            </Field>
          </div>
        </Section>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex w-full items-center justify-center gap-2 py-3 text-sm font-semibold skin-btn-primary"
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Enregistrer le colis
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </motion.form>
    </div>
  );
}

function Section({
  title,
  Icon,
  children,
}: {
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="p-6 space-y-4 skin-card">
      <div className="flex items-center gap-2">
        <div
          className="flex h-8 w-8 items-center justify-center skin-radius"
          style={{
            background: 'color-mix(in oklab, var(--skin-primary) 12%, transparent)',
            color: 'var(--skin-primary)',
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <h2
          className="text-base font-semibold skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
