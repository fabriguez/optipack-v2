'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

export interface CarrierLike {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  carrierType?: string | null;
  notes?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Si fourni : mode edition. */
  carrier?: CarrierLike | null;
  /** Appele apres creation/edition avec le transporteur. */
  onSaved?: (carrier: { id: string; name: string }) => void;
}

const TYPE_OPTIONS = [
  { value: 'LAND', label: 'Terrestre' },
  { value: 'SEA', label: 'Maritime' },
  { value: 'AIR', label: 'Aerien' },
  { value: 'MULTI', label: 'Multi-modal' },
];

/**
 * Dialog create/edit transporteur. Le backend cree automatiquement un
 * Client associe lors du POST initial pour permettre les paiements / dettes
 * via la mecanique Client standard.
 */
export function CarrierFormDialog({ open, onClose, carrier, onSaved }: Props) {
  const qc = useQueryClient();
  const isEdit = !!carrier;
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [carrierType, setCarrierType] = useState('LAND');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (carrier) {
      setName(carrier.name);
      setContactName(carrier.contactName ?? '');
      setPhone(carrier.phone ?? '');
      setEmail(carrier.email ?? '');
      setAddress(carrier.address ?? '');
      setCarrierType(carrier.carrierType ?? 'LAND');
      setNotes(carrier.notes ?? '');
    } else {
      setName(''); setContactName(''); setPhone(''); setEmail('');
      setAddress(''); setCarrierType('LAND'); setNotes('');
    }
  }, [open, carrier]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        carrierType,
        notes: notes.trim() || undefined,
      };
      const res = isEdit && carrier
        ? await apiClient.patch(`/carriers/${carrier.id}`, body)
        : await apiClient.post('/carriers', body);
      const saved = res.data?.data;
      if (saved?.id) {
        toast.success(isEdit
          ? `Transporteur ${saved.name} mis a jour`
          : `Transporteur ${saved.name} cree (client associe : ${saved.client?.fullName ?? '-'})`);
        qc.invalidateQueries({ queryKey: ['carriers'] });
        if (isEdit) qc.invalidateQueries({ queryKey: ['carriers', carrier!.id] });
        onSaved?.({ id: saved.id, name: saved.name });
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || `Erreur ${isEdit ? 'mise a jour' : 'creation'} transporteur`);
    }
    setSubmitting(false);
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le transporteur' : 'Nouveau transporteur'}
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="button" loading={submitting} onClick={handleSubmit}>
            {isEdit ? 'Enregistrer' : 'Creer'}
          </AppButton>
        </>
      }
    >
      <div className="space-y-4">
        <AppInput
          label="Nom"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          placeholder="Ex: Transports Mboum"
        />
        {!isEdit && (
          <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-primary-800">
            Un client comptable sera cree automatiquement pour ce transporteur :
            il pourra recevoir des paiements / dettes au meme titre qu&apos;un client standard.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <AppInput
            label="Contact"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Nom de la personne"
          />
          <AppSelect
            label="Type"
            options={TYPE_OPTIONS}
            value={carrierType}
            onValueChange={setCarrierType}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <AppInput
            label="Telephone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+237..."
          />
          <AppInput
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <AppInput
          label="Adresse"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
        <AppTextarea
          label="Notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />
      </div>
    </AppDialog>
  );
}
