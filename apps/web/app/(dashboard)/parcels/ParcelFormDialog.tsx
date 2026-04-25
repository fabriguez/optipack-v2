'use client';

import { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createParcelSchema, type CreateParcelInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect, type SearchOption } from '@/components/ui/AppSearchSelect';
import { useCreateParcel, useUpdateParcel } from '@/lib/hooks/useParcels';
import { searchers } from '@/lib/api/searchers';

interface ParcelLike {
  id: string;
  designation: string;
  destination: string;
  weight?: number | string | null;
  volume?: number | string | null;
  observation?: string | null;
  client?: { id: string; fullName: string; phone?: string };
  recipient?: { id: string; fullName: string; phone?: string } | null;
  warehouse?: { id: string; name: string; agency?: { name: string } } | null;
  transitRoute?: { id: string; name: string; type?: string } | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  parcel?: ParcelLike | null; // si fourni : mode edition
}

type Mode = 'weight' | 'volume' | 'both';

export function ParcelFormDialog({ open, onClose, parcel }: Props) {
  const isEdit = !!parcel;
  const createMutation = useCreateParcel();
  const updateMutation = useUpdateParcel();

  const [selectedClient, setSelectedClient] = useState<SearchOption | null>(null);
  const [selectedRecipient, setSelectedRecipient] = useState<SearchOption | null>(null);
  const [selectedWarehouse, setSelectedWarehouse] = useState<SearchOption | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<SearchOption | null>(null);
  const [mode, setMode] = useState<Mode>('weight');

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<CreateParcelInput>({
    resolver: zodResolver(createParcelSchema),
  });

  const weight = watch('weight');
  const volume = watch('volume');

  useEffect(() => {
    if (!open) return;
    if (parcel) {
      reset({
        designation: parcel.designation,
        destination: parcel.destination,
        weight: parcel.weight ? Number(parcel.weight) : undefined,
        volume: parcel.volume ? Number(parcel.volume) : undefined,
        observation: parcel.observation || '',
        clientId: parcel.client?.id ?? '',
        recipientId: parcel.recipient?.id,
        warehouseId: parcel.warehouse?.id ?? '',
        transitRouteId: parcel.transitRoute?.id ?? '',
      });
      if (parcel.client) {
        setSelectedClient({ value: parcel.client.id, label: parcel.client.fullName, sublabel: parcel.client.phone });
      }
      if (parcel.recipient) {
        setSelectedRecipient({ value: parcel.recipient.id, label: parcel.recipient.fullName, sublabel: parcel.recipient.phone });
      }
      if (parcel.warehouse) {
        setSelectedWarehouse({
          value: parcel.warehouse.id,
          label: parcel.warehouse.name,
          sublabel: parcel.warehouse.agency?.name ?? null,
        });
      }
      if (parcel.transitRoute) {
        setSelectedRoute({ value: parcel.transitRoute.id, label: parcel.transitRoute.name, sublabel: parcel.transitRoute.type ?? null });
      }
      const hasW = parcel.weight !== null && parcel.weight !== undefined && Number(parcel.weight) > 0;
      const hasV = parcel.volume !== null && parcel.volume !== undefined && Number(parcel.volume) > 0;
      setMode(hasW && hasV ? 'both' : hasV ? 'volume' : 'weight');
    } else {
      reset({});
      setSelectedClient(null);
      setSelectedRecipient(null);
      setSelectedWarehouse(null);
      setSelectedRoute(null);
      setMode('weight');
    }
  }, [open, parcel, reset]);

  const onSubmit = async (data: CreateParcelInput) => {
    if (mode === 'weight') data.volume = undefined;
    if (mode === 'volume') data.weight = undefined;

    if (isEdit && parcel) {
      await updateMutation.mutateAsync({
        id: parcel.id,
        data: {
          designation: data.designation,
          destination: data.destination,
          weight: mode === 'volume' ? null : data.weight,
          volume: mode === 'weight' ? null : data.volume,
          observation: data.observation || null,
          recipientId: data.recipientId ?? null,
          warehouseId: data.warehouseId,
          transitRouteId: data.transitRouteId,
        },
      });
    } else {
      await createMutation.mutateAsync(data);
    }
    reset();
    onClose();
  };

  return (
    <AppDialog open={open} onClose={onClose} title={isEdit ? 'Modifier le colis' : 'Nouveau colis'} size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput label="Designation" {...register('designation')} error={errors.designation?.message} />
          <AppInput label="Destination" {...register('destination')} error={errors.destination?.message} />

          <div className="sm:col-span-2">
            <div className="mb-2 inline-flex rounded-xl border border-gray-200 p-0.5 text-xs">
              {(['weight', 'volume', 'both'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-3 py-1.5 ${mode === m ? 'bg-primary-500 text-white' : 'text-gray-500'}`}
                >
                  {m === 'weight' ? 'Par masse' : m === 'volume' ? 'Par volume' : 'Les deux'}
                </button>
              ))}
            </div>
          </div>

          {(mode === 'weight' || mode === 'both') && (
            <AppInput
              label="Masse (kg)"
              type="number"
              step="0.1"
              {...register('weight', { valueAsNumber: true })}
              error={errors.weight?.message}
            />
          )}
          {(mode === 'volume' || mode === 'both') && (
            <AppInput
              label="Volume (m3)"
              type="number"
              step="0.01"
              {...register('volume', { valueAsNumber: true })}
              error={errors.volume?.message}
            />
          )}

          <Controller
            control={control}
            name="clientId"
            render={({ field }) => (
              <AppSearchSelect
                label="Client"
                value={field.value}
                onChange={(v) => {
                  field.onChange(v);
                  if (!v) setSelectedClient(null);
                }}
                search={(q, l) => searchers.clients(q, l)}
                selectedOption={selectedClient}
                error={errors.clientId?.message}
                required
                placeholder="Selectionner un client"
              />
            )}
          />

          <Controller
            control={control}
            name="recipientId"
            render={({ field }) => (
              <AppSearchSelect
                label="Destinataire"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? undefined)}
                search={(q, l) => searchers.recipients(q, l)}
                selectedOption={selectedRecipient}
                placeholder="Selectionner un destinataire (optionnel)"
              />
            )}
          />

          <Controller
            control={control}
            name="warehouseId"
            render={({ field }) => (
              <AppSearchSelect
                label="Magasin"
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                search={(q, l) => searchers.warehouses(q, l)}
                selectedOption={selectedWarehouse}
                error={errors.warehouseId?.message}
                required
                placeholder="Selectionner un magasin"
              />
            )}
          />

          <Controller
            control={control}
            name="transitRouteId"
            render={({ field }) => (
              <AppSearchSelect
                label="Route de transit"
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                search={(q, l) => searchers.transitRoutes(q, l)}
                selectedOption={selectedRoute}
                error={errors.transitRouteId?.message}
                required
                placeholder="Selectionner une route"
              />
            )}
          />

          <AppInput label="Observation" {...register('observation')} className="sm:col-span-2" />
        </div>

        {!isEdit && (
          <div className="rounded-xl bg-primary-50 p-4 text-sm text-primary-800">
            Le prix sera calcule automatiquement selon la route, la tarification partenaire (si applicable) et le palier de fidelite.
            Une facture sera generee automatiquement.
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="submit" loading={createMutation.isPending || updateMutation.isPending}>
            {isEdit ? 'Enregistrer les modifications' : 'Enregistrer le colis'}
          </AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
