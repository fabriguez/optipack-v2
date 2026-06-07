import { z } from 'zod';
import { View, Text } from 'react-native';
import { AppTextInput, AppPhoneInput, AppSelect, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  contactName: z.string().optional(),
  carrierType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address: z.string().optional(),
  notes: z.string().optional(),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
});

const TYPES = [
  { value: 'LAND', label: 'Terrestre' },
  { value: 'SEA', label: 'Maritime' },
  { value: 'AIR', label: 'Aerien' },
  { value: 'MULTI', label: 'Multi-modal' },
];

interface Carrier {
  id: string;
  name?: string;
  contactName?: string | null;
  carrierType?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
}

export function CarrierFormDialog({
  open,
  onClose,
  carrier,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  carrier?: Carrier;
  onSaved?: (c: { id: string; name: string }) => void;
}) {
  const isEdit = !!carrier;
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le transporteur' : 'Nouveau transporteur'}
      schema={schema}
      defaultValues={{
        name: carrier?.name ?? '',
        contactName: carrier?.contactName ?? '',
        carrierType: carrier?.carrierType ?? 'LAND',
        phone: carrier?.phone ?? '',
        email: carrier?.email ?? '',
        address: carrier?.address ?? '',
        notes: carrier?.notes ?? '',
        emergencyContactName: carrier?.emergencyContactName ?? '',
        emergencyContactPhone: carrier?.emergencyContactPhone ?? '',
        emergencyContactRelation: carrier?.emergencyContactRelation ?? '',
      }}
      submit={async (v) => {
        const payload = { ...v, email: v.email || undefined };
        const res = isEdit
          ? await apiClient.patch(`/carriers/${carrier!.id}`, payload).then((r) => r.data)
          : await apiClient.post('/carriers', payload).then((r) => r.data);
        const c = res?.data ?? res;
        if (c?.id) onSaved?.({ id: c.id, name: c.name ?? v.name });
        return res;
      }}
      invalidate={[['carriers']]}
      successMessage={isEdit ? 'Transporteur mis a jour' : 'Transporteur cree'}
      submitLabel={isEdit ? 'Enregistrer' : 'Creer'}
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="name" label="Nom" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="contactName" label="Contact" /></View>
            <View style={{ flex: 1 }}><AppSelect control={control} name="carrierType" label="Type" options={TYPES} /></View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppPhoneInput control={control} name="phone" label="Telephone" /></View>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" /></View>
          </View>
          <AppTextInput control={control} name="address" label="Adresse" />
          <AppTextInput control={control} name="notes" label="Notes" multiline />

          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700], marginTop: spacing.sm }}>Contact d'urgence</Text>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}><AppTextInput control={control} name="emergencyContactName" label="Nom" /></View>
            <View style={{ flex: 1 }}><AppPhoneInput control={control} name="emergencyContactPhone" label="Telephone" /></View>
          </View>
          <AppTextInput control={control} name="emergencyContactRelation" label="Lien de parente" />
        </>
      )}
    </ResourceFormDialog>
  );
}
