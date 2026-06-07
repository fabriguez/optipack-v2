import { useEffect, useState } from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AppDialog } from '@/components/forms/AppDialog';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { EntityPicker } from '@/components/data/EntityPicker';
import { parcelsApi } from '@/lib/api/parcels';
import { searchers } from '@/lib/api/searchers';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

interface ParcelLike {
  id: string;
  trackingNumber: string;
  designation?: string;
  clientId?: string | null;
  client?: { id: string; fullName: string; phone?: string | null } | null;
  recipientId?: string | null;
  recipient?: { id: string; fullName: string; phone?: string | null } | null;
}

/** Remise de colis au client (mirror web ParcelHandoverDialog) : mode enregistre ou non enregistre. */
export function ParcelHandoverDialog({
  open,
  onClose,
  parcel,
  untracked,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  parcel?: ParcelLike | null;
  untracked?: { agencyId: string; warehouseId: string } | null;
  onSuccess?: () => void;
}) {
  const qc = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [note, setNote] = useState('');
  const [designation, setDesignation] = useState('');
  const [observation, setObservation] = useState('');

  useEffect(() => {
    if (!open) return;
    setClientId(parcel?.recipientId ?? parcel?.clientId ?? '');
    setClientName(parcel?.recipient?.fullName ?? parcel?.client?.fullName ?? '');
    setIdentityConfirmed(false);
    setNote('');
    setDesignation('');
    setObservation('');
  }, [open, parcel]);

  const mutation = useMutation({
    mutationFn: () => {
      if (parcel) return parcelsApi.handover(parcel.id, { receivedByClientId: clientId, identityConfirmed, note: note || undefined });
      if (untracked) return parcelsApi.handoverUntracked({ agencyId: untracked.agencyId, warehouseId: untracked.warehouseId, receivedByClientId: clientId, designation, observation: observation || undefined, identityConfirmed });
      throw new Error('Mode invalide');
    },
    onSuccess: () => { toast.success('Colis remis au client'); qc.invalidateQueries({ queryKey: ['parcels'] }); onSuccess?.(); onClose(); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });

  const canSubmit = !!clientId && identityConfirmed && (!!parcel || (!!untracked && designation.trim().length > 0));

  // Recepteurs autorises (mode enregistre) : emetteur + destinataire.
  const options: { id: string; label: string; role: string }[] = [];
  if (parcel?.client && parcel.clientId) options.push({ id: parcel.clientId, label: parcel.client.fullName, role: 'Emetteur' });
  if (parcel?.recipient && parcel.recipientId && parcel.recipientId !== parcel.clientId) options.push({ id: parcel.recipientId, label: parcel.recipient.fullName, role: 'Destinataire' });

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={parcel ? `Remettre ${parcel.trackingNumber}` : 'Remettre un colis non enregistre'}
      width={520}
      footer={
        <>
          <Button variant="ghost" onPress={onClose}>Annuler</Button>
          <Button loading={mutation.isPending} disabled={!canSubmit} onPress={() => mutation.mutate()}>Confirmer la remise</Button>
        </>
      }
    >
      {parcel && (
        <View style={{ backgroundColor: colors.gray[50], borderRadius: radius.md, padding: spacing.md }}>
          <Text style={{ fontFamily: 'monospace', fontWeight: '700', color: colors.primary[700] }}>{parcel.trackingNumber}</Text>
          <Text style={{ fontSize: 13, color: colors.gray[700] }}>{parcel.designation}</Text>
        </View>
      )}

      {untracked && (
        <View style={{ backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082', borderRadius: radius.md, padding: spacing.md, gap: spacing.sm }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: '#8D6E00' }}>Colis non enregistre — il sera cree et marque remis.</Text>
          <Input label="Designation" value={designation} onChangeText={setDesignation} placeholder="Ex: Carton bleu sans etiquette" />
          <Input label="Observation" value={observation} onChangeText={setObservation} />
        </View>
      )}

      {parcel ? (
        options.length === 0 ? (
          <Text style={{ fontSize: 12, color: '#8D6E00', backgroundColor: '#FFF8E1', borderRadius: radius.md, padding: spacing.md }}>
            Ni emetteur ni destinataire valide. Remise impossible.
          </Text>
        ) : (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Client recepteur</Text>
            {options.map((opt) => {
              const checked = clientId === opt.id;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => { setClientId(opt.id); setClientName(opt.label); }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: checked ? colors.primary[500] : colors.gray[200], backgroundColor: checked ? colors.primary[50] : colors.white, borderRadius: radius.md, padding: spacing.md }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{opt.label}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.primary[700] }}>{opt.role}</Text>
                  </View>
                  {checked && <Ionicons name="checkmark-circle" size={18} color={colors.primary[600]} />}
                </Pressable>
              );
            })}
          </View>
        )
      ) : (
        <View style={{ gap: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[700] }}>Client recepteur</Text>
          <EntityPicker value={clientId} name={clientName} onChange={(id, nm) => { setClientId(id); setClientName(nm); }} searcher={searchers.clients} queryKey="clients" placeholder="Rechercher un client..." />
        </View>
      )}

      <Input label="Note de remise (optionnelle)" value={note} onChangeText={setNote} placeholder="Ressemblance OK, procuration verifiee..." />

      <Pressable onPress={() => setIdentityConfirmed((v) => !v)} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, backgroundColor: colors.primary[50], borderRadius: radius.md, padding: spacing.md }}>
        <Switch value={identityConfirmed} onValueChange={setIdentityConfirmed} trackColor={{ true: colors.primary[400], false: colors.gray[300] }} thumbColor={colors.white} />
        <Text style={{ flex: 1, fontSize: 12, color: colors.gray[700] }}>
          Je confirme avoir confronte l'identite (CNI + personne) et valide la remise. Tracé dans l'historique.
        </Text>
      </Pressable>
    </AppDialog>
  );
}
