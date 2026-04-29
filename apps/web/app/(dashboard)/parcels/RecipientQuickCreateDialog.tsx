'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientSchema, type CreateClientInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppPhoneInput } from '@/components/ui/AppPhoneInput';
import { AppSearchSelect, type SearchOption } from '@/components/ui/AppSearchSelect';
import { AppSelect } from '@/components/ui/AppSelect';
import { clientsApi } from '@/lib/api/clients';
import { searchers } from '@/lib/api/searchers';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Nom pre-rempli depuis la recherche du SearchSelect */
  initialName?: string;
  /** Appele apres creation reussie : retourne l'option correspondant au nouveau destinataire/client. */
  onCreated?: (recipient: SearchOption) => void;
}

/**
 * Dialog de creation rapide d'un destinataire.
 * Cree un Client (la table recipients a fusionne avec clients) qui peut donc
 * etre utilise comme destinataire ET comme expediteur ulterieurement.
 */
export function RecipientQuickCreateDialog({ open, onClose, initialName, onCreated }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: { clientType: 'INDIVIDUAL', loyaltyTier: 'STANDARD', isActive: true },
  });

  useEffect(() => {
    if (open) {
      reset({
        fullName: initialName || '',
        phone: '',
        email: '',
        address: '',
        agencyId: '',
        clientType: 'INDIVIDUAL',
        loyaltyTier: 'STANDARD',
        isActive: true,
      });
    }
  }, [open, initialName, reset]);

  const onSubmit = async (data: CreateClientInput) => {
    setSubmitting(true);
    try {
      const res = await clientsApi.create(data);
      const c = res.data;
      if (c) {
        toast.success('Destinataire cree');
        onCreated?.({ value: c.id, label: c.fullName, sublabel: c.phone });
        reset();
        onClose();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Erreur lors de la creation du destinataire');
    }
    setSubmitting(false);
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau destinataire"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Annuler
          </AppButton>
          <AppButton type="submit" form="recipient-quick-form" loading={submitting}>
            Creer le destinataire
          </AppButton>
        </>
      }
    >
      <form id="recipient-quick-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-xs text-gray-500">
          Le destinataire est ajoute a la liste des clients et pourra aussi etre utilise comme
          expediteur plus tard.
        </p>

        <AppInput label="Nom complet" {...register('fullName')} error={errors.fullName?.message} />

        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <AppPhoneInput
              label="Telephone"
              value={field.value}
              onChange={field.onChange}
              error={errors.phone?.message}
            />
          )}
        />

        <AppInput label="Email (optionnel)" type="email" {...register('email')} error={errors.email?.message} />

        <Controller
          control={control}
          name="clientType"
          render={({ field }) => (
            <AppSelect
              label="Type"
              value={field.value}
              onValueChange={(v) => field.onChange(v)}
              options={[
                { value: 'INDIVIDUAL', label: 'Particulier' },
                { value: 'COMPANY', label: 'Entreprise' },
                { value: 'PARTNER', label: 'Partenaire' },
              ]}
            />
          )}
        />

        <Controller
          control={control}
          name="agencyId"
          render={({ field }) => (
            <AppSearchSelect
              label="Agence"
              value={field.value}
              onChange={(v) => field.onChange(v ?? '')}
              search={(q, l) => searchers.agencies(q, l)}
              error={errors.agencyId?.message}
              required
              placeholder="Selectionner une agence"
            />
          )}
        />

      </form>
    </AppDialog>
  );
}
