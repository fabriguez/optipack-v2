'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createWarehouseSchema, type CreateWarehouseInput } from '@transitsoftservices/shared';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { useAgencies } from '@/lib/hooks/useAgencies';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props { open: boolean; onClose: () => void; }

export function WarehouseFormDialog({ open, onClose }: Props) {
  const qc = useQueryClient();
  const { data: agencies } = useAgencies({ limit: 100 });
  const mutation = useMutation({
    mutationFn: (data: any) => apiClient.post('/warehouses', data).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['warehouses'] }); toast.success('Magasin cree'); onClose(); },
    onError: () => toast.error('Erreur'),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateWarehouseInput>({
    resolver: zodResolver(createWarehouseSchema),
  });

  const onSubmit = (data: CreateWarehouseInput) => { mutation.mutate(data); reset(); };

  return (
    <AppDialog open={open} onClose={onClose} title="Nouveau magasin" size="md">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <AppInput label="Nom" {...register('name')} error={errors.name?.message} />
        <AppSelect label="Agence" {...register('agencyId')} error={errors.agencyId?.message}
          options={(agencies?.data || []).map((a: any) => ({ value: a.id, label: a.name }))} placeholder="Selectionner" />
        <AppInput label="Emplacement" {...register('location')} error={errors.location?.message} />
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <AppButton variant="ghost" type="button" onClick={onClose}>Annuler</AppButton>
          <AppButton type="submit" loading={mutation.isPending}>Creer</AppButton>
        </div>
      </form>
    </AppDialog>
  );
}
