'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api/client';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSearchSelect } from '@/components/ui/AppSearchSelect';
import { AppSelect } from '@/components/ui/AppSelect';
import { searchers, toSearchOption } from '@/lib/api/searchers';
import { Plus, Trash2, Package } from 'lucide-react';
import { toast } from 'sonner';

interface ParcelInGroup {
  designation: string;
  weight?: number;
  destination: string;
  category?: string;
  price?: number;
  warehouseId?: string;
  observation?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaultAgency?: { id: string; name: string; city?: string | null } | null;
}

const CATEGORY_OPTIONS = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'DOCUMENT', label: 'Document' },
  { value: 'FOOD', label: 'Alimentaire' },
  { value: 'ELECTRONICS', label: 'Electronique' },
  { value: 'CLOTHING', label: 'Vetements' },
  { value: 'OTHER', label: 'Autre' },
];

export function ParcelGroupFormDialog({ open, onClose, defaultAgency }: Props) {
  const qc = useQueryClient();
  const router = useRouter();

  const [clientId, setClientId] = useState<string>('');
  const [agencyId, setAgencyId] = useState<string>(defaultAgency?.id ?? '');
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [parcels, setParcels] = useState<ParcelInGroup[]>([
    { designation: '', destination: '', category: 'STANDARD', price: 0 },
  ]);

  useEffect(() => {
    if (!open) return;
    setClientId('');
    setAgencyId(defaultAgency?.id ?? '');
    setLabel('');
    setNotes('');
    setParcels([{ designation: '', destination: '', category: 'STANDARD', price: 0 }]);
  }, [open, defaultAgency]);

  const updateParcel = (i: number, patch: Partial<ParcelInGroup>) =>
    setParcels((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));

  const addParcel = () =>
    setParcels((prev) => [
      ...prev,
      { designation: '', destination: '', category: 'STANDARD', price: 0 },
    ]);

  const removeParcel = (i: number) =>
    setParcels((prev) => prev.filter((_, idx) => idx !== i));

  const mutation = useMutation({
    mutationFn: () =>
      apiClient.post('/parcel-groups', {
        clientId,
        agencyId,
        label: label || undefined,
        notes: notes || undefined,
        parcels: parcels
          .filter((p) => p.designation.trim() && p.destination.trim())
          .map((p) => ({
            designation: p.designation.trim(),
            destination: p.destination.trim(),
            category: p.category,
            weight: p.weight ?? undefined,
            price: p.price ?? 0,
            warehouseId: p.warehouseId || undefined,
            observation: p.observation || undefined,
          })),
      }),
    onSuccess: (res) => {
      const group = res.data?.data;
      toast.success(`Groupe ${group?.reference} cree avec ${group?.parcels?.length} colis`);
      qc.invalidateQueries({ queryKey: ['parcel-groups'] });
      qc.invalidateQueries({ queryKey: ['parcels'] });
      onClose();
      if (group?.id) router.push(`/parcels?parcelGroupId=${group.id}`);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || 'Erreur'),
  });

  const total = parcels.reduce((sum, p) => sum + Number(p.price ?? 0), 0);
  const validCount = parcels.filter((p) => p.designation.trim() && p.destination.trim()).length;

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau groupe de colis"
      size="xl"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!clientId || !agencyId || validCount === 0}
          >
            <Package className="h-4 w-4" />
            Creer le groupe ({validCount} colis)
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AppSearchSelect
            label="Client"
            value={clientId}
            onChange={(v) => setClientId(v ?? '')}
            search={searchers.clients}
            required
            placeholder="Rechercher un client..."
          />
          <AppSearchSelect
            label="Agence"
            value={agencyId}
            onChange={(v) => setAgencyId(v ?? '')}
            search={searchers.agencies}
            selectedOption={defaultAgency ? toSearchOption.agency(defaultAgency) : undefined}
            disabled={!!defaultAgency}
            required
            placeholder="Selectionner une agence"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AppInput label="Libelle (optionnel)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <AppInput label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="rounded-2xl border border-gray-100 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Colis du groupe ({parcels.length})</p>
            <p className="text-xs text-gray-500">
              Total : <span className="font-bold text-primary-700">{total.toLocaleString()} XAF</span>
            </p>
          </div>
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {parcels.map((p, i) => (
              <div key={i} className="grid grid-cols-1 items-end gap-2 rounded-xl border border-gray-100 p-2 sm:grid-cols-12">
                <div className="sm:col-span-3">
                  <AppInput
                    label={`Designation ${i + 1}`}
                    value={p.designation}
                    onChange={(e) => updateParcel(i, { designation: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-3">
                  <AppInput
                    label="Destination"
                    value={p.destination}
                    onChange={(e) => updateParcel(i, { destination: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <AppSelect
                    label="Categorie"
                    options={CATEGORY_OPTIONS}
                    value={p.category ?? 'STANDARD'}
                    onValueChange={(v) => updateParcel(i, { category: v })}
                  />
                </div>
                <div className="sm:col-span-1">
                  <AppInput
                    label="Poids"
                    type="number"
                    step="0.01"
                    value={p.weight != null ? String(p.weight) : ''}
                    onChange={(e) => updateParcel(i, { weight: Number(e.target.value) || undefined })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <AppInput
                    label="Prix (XAF)"
                    type="number"
                    value={String(p.price ?? 0)}
                    onChange={(e) => updateParcel(i, { price: Number(e.target.value) || 0 })}
                  />
                </div>
                <div className="sm:col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeParcel(i)}
                    disabled={parcels.length === 1}
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50 disabled:opacity-30"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <AppButton variant="outline" size="sm" onClick={addParcel}>
              <Plus className="h-3.5 w-3.5" />
              Ajouter un colis
            </AppButton>
          </div>
        </div>
      </div>
    </AppDialog>
  );
}
