'use client';

import { useEffect, useId, useState } from 'react';
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
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Nom pre-rempli depuis la recherche du SearchSelect. */
  initialName?: string;
  /** Agence pre-selectionnee (ex : deduite du contexte du formulaire colis). */
  defaultAgencyId?: string | null;
  /**
   * Libelle de l'entite cree, pour adapter titre / bouton / toast selon le
   * contexte d'appel ('client' pour l'expediteur, 'destinataire' pour le
   * recepteur). Dans les deux cas on cree un Client (tables fusionnees).
   */
  entityLabel?: string;
  /** Appele apres creation reussie : retourne l'option du nouveau client. */
  onCreated?: (client: SearchOption) => void;
}

/**
 * Dialog de creation rapide d'un client (expediteur ou destinataire).
 * La table recipients a fusionne avec clients : un client cree ici peut donc
 * servir d'expediteur ET de destinataire. Version allegee (champs essentiels)
 * pour un ajout inline depuis un selecteur, sans quitter le formulaire colis.
 */
export function ClientQuickCreateDialog({
  open,
  onClose,
  initialName,
  defaultAgencyId,
  entityLabel = 'client',
  onCreated,
}: Props) {
  const formId = useId();
  const [submitting, setSubmitting] = useState(false);
  const cap = entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);

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
        agencyId: defaultAgencyId || '',
        clientType: 'INDIVIDUAL',
        loyaltyTier: 'STANDARD',
        isActive: true,
      });
    }
  }, [open, initialName, defaultAgencyId, reset]);

  const onSubmit = async (data: CreateClientInput) => {
    setSubmitting(true);
    try {
      const res = await clientsApi.create(data);
      const c = res.data;
      if (c) {
        toast.success(`${cap} cree`);
        onCreated?.(toSearchOption.client(c));
        reset();
        onClose();
      }
    } catch (e: any) {
      toast.error(e?.response?.data?.message || `Erreur lors de la creation du ${entityLabel}`);
    }
    setSubmitting(false);
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={`Nouveau ${entityLabel}`}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose} disabled={submitting}>
            Annuler
          </AppButton>
          <AppButton type="submit" form={formId} loading={submitting}>
            Creer le {entityLabel}
          </AppButton>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="text-xs text-gray-500">
          Le {entityLabel} est ajoute a la liste des clients et pourra etre utilise comme
          expediteur ou destinataire. Renseignez au moins un telephone ou un email.
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
              search={searchers.myAgencies}
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
