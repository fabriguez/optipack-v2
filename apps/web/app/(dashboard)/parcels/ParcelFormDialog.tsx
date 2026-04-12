'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createParcelSchema, type CreateParcelInput } from '@optipack/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { useCreateParcel } from '@/lib/hooks/useParcels';
import { useClients } from '@/lib/hooks/useClients';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

interface ParcelFormDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ParcelFormDialog({ open, onClose }: ParcelFormDialogProps) {
  const createMutation = useCreateParcel();
  const { data: clients } = useClients({ limit: 200 });

  // Charger les magasins de toutes les agences
  const { data: warehousesData } = useQuery({
    queryKey: ['all-warehouses'],
    queryFn: async () => {
      const agenciesRes = await apiClient.get('/agencies', { params: { limit: 100 } });
      const allWarehouses: any[] = [];
      for (const agency of agenciesRes.data.data || []) {
        const whRes = await apiClient.get(`/warehouses/agency/${agency.id}`, { params: { limit: 100 } });
        for (const wh of whRes.data.data || []) {
          allWarehouses.push({ ...wh, agencyName: agency.name });
        }
      }
      return allWarehouses;
    },
  });

  // Charger les routes de transit
  const { data: routesData } = useQuery({
    queryKey: ['transit-routes-active'],
    queryFn: () => apiClient.get('/transit-routes/active').then((r) => r.data),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateParcelInput>({
    resolver: zodResolver(createParcelSchema),
  });

  const onSubmit = async (data: CreateParcelInput) => {
    await createMutation.mutateAsync(data);
    reset();
    onClose();
  };

  const clientOptions = (clients?.data || []).map((c: any) => ({
    value: c.id,
    label: `${c.fullName} (${c.phone})`,
  }));

  const warehouseOptions = (warehousesData || []).map((w: any) => ({
    value: w.id,
    label: `${w.name} - ${w.agencyName}`,
  }));

  const routeOptions = (routesData?.data || []).map((r: any) => ({
    value: r.id,
    label: `${r.name} (${r.departureCity} → ${r.arrivalCity}) - ${r.pricePerKg} XAF/kg`,
  }));

  return (
    <AppDialog open={open} onClose={onClose} title="Nouveau colis" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AppInput label="Designation" {...register('designation')} error={errors.designation?.message} />
          <AppInput label="Destination" {...register('destination')} error={errors.destination?.message} />
          <AppInput label="Masse (kg)" type="number" step="0.1" {...register('weight', { valueAsNumber: true })} error={errors.weight?.message} />
          <AppInput label="Volume (m3)" type="number" step="0.01" {...register('volume', { valueAsNumber: true })} error={errors.volume?.message} />
          <AppSelect label="Client" {...register('clientId')} error={errors.clientId?.message} options={clientOptions} placeholder="Selectionner un client" />
          <AppInput label="Observation" {...register('observation')} />
          <AppSelect label="Magasin" {...register('warehouseId')} error={errors.warehouseId?.message} options={warehouseOptions} placeholder="Selectionner un magasin" />
          <AppSelect label="Route de transit" {...register('transitRouteId')} error={errors.transitRouteId?.message} options={routeOptions} placeholder="Selectionner une route" />
        </div>

        <div className="rounded-xl bg-primary-50 p-4 text-sm text-primary-800">
          Le prix sera calcule automatiquement selon la route de transit et le palier de fidelite du client.
          Une facture sera generee automatiquement.
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={createMutation.isPending}>Enregistrer le colis</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
