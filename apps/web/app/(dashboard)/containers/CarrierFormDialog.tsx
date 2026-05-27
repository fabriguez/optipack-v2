'use client';

import { useState } from 'react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { AppSelect } from '@/components/ui/AppSelect';
import { AppTextarea } from '@/components/ui/AppTextarea';
import { apiClient } from '@/lib/api/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Appele apres creation avec le transporteur cree (id + name). */
  onCreated?: (carrier: { id: string; name: string }) => void;
}

const TYPE_OPTIONS = [
  { value: 'LAND', label: 'Terrestre' },
  { value: 'SEA', label: 'Maritime' },
  { value: 'AIR', label: 'Aerien' },
  { value: 'MULTI', label: 'Multi-modal' },
];

/**
 * Dialog rapide pour creer un transporteur depuis la page conteneur.
 * Cree automatiquement un Client lie cote backend (carrier.routes.ts).
 */
export function CarrierFormDialog({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [carrierType, setCarrierType] = useState('LAND');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName(''); setContactName(''); setPhone(''); setEmail('');
    setAddress(''); setCarrierType('LAND'); setNotes('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error('Le nom est obligatoire');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post('/carriers', {
        name: name.trim(),
        contactName: contactName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        carrierType,
        notes: notes.trim() || undefined,
      });
      const created = res.data?.data;
      if (created?.id) {
        toast.success(`Transporteur ${created.name} cree (client associe : ${created.client?.fullName ?? '-'})`);
        onCreated?.({ id: created.id, name: created.name });
        reset();
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erreur creation transporteur');
    }
    setSubmitting(false);
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Nouveau transporteur"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" type="button" onClick={onClose}>
            Annuler
          </AppButton>
          <AppButton type="button" loading={submitting} onClick={handleSubmit}>
            Creer
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
        <p className="rounded-xl bg-primary-50 px-3 py-2 text-xs text-primary-800">
          Un client comptable sera cree automatiquement pour ce transporteur :
          il pourra recevoir des paiements / dettes au meme titre qu&apos;un client standard.
        </p>
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
