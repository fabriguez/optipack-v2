import { z } from 'zod';
import { View, Text } from 'react-native';
import { AppTextInput, AppPhoneInput, AppSelect, AppSearchSelect, ImageInput, ResourceFormDialog } from '@/components/forms';
import { clientsApi } from '@/lib/api/clients';
import { searchers } from '@/lib/api/searchers';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  fullName: z.string().min(2, 'Nom requis'),
  phone: z.string().min(4, 'Telephone requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  idNumber: z.string().optional(),
  address: z.string().optional(),
  clientType: z.string().optional(),
  loyaltyTier: z.string().optional(),
  agencyId: z.string().optional().or(z.literal('')),
  emergencyContactName: z.string().optional(),
  emergencyContactPhone: z.string().optional(),
  emergencyContactRelation: z.string().optional(),
  profile: z.any().optional(),
  idDocument: z.any().optional(),
  idDocumentBack: z.any().optional(),
});

type FormValues = z.infer<typeof schema>;

const TYPE_OPTIONS = [
  { value: 'INDIVIDUAL', label: 'Particulier' },
  { value: 'COMPANY', label: 'Entreprise' },
  { value: 'PARTNER', label: 'Partenaire' },
];
const TIER_OPTIONS = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'SILVER', label: 'Silver' },
  { value: 'GOLD', label: 'Gold' },
  { value: 'VIP', label: 'VIP' },
];

interface Client {
  id: string;
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  idNumber?: string | null;
  address?: string | null;
  clientType?: string | null;
  loyaltyTier?: string | null;
  agencyId?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  emergencyContactRelation?: string | null;
}

export function ClientFormDialog({ open, onClose, client }: { open: boolean; onClose: () => void; client?: Client }) {
  const isEdit = !!client;

  const submit = async (v: FormValues) => {
    const { profile, idDocument, idDocumentBack, ...rest } = v;
    const payload = {
      ...rest,
      email: rest.email || undefined,
      agencyId: rest.agencyId || undefined,
      clientType: rest.clientType || 'INDIVIDUAL',
      loyaltyTier: rest.loyaltyTier || 'STANDARD',
    };
    const targetId = isEdit ? client!.id : (await clientsApi.create(payload as never))?.data?.id;
    if (isEdit) await clientsApi.update(client!.id, payload as never);
    if (targetId) {
      const uploads: Promise<unknown>[] = [];
      if (profile?.uri) uploads.push(clientsApi.uploadImage(targetId, 'profile', profile));
      if (idDocument?.uri) uploads.push(clientsApi.uploadImage(targetId, 'idDocument', idDocument));
      if (idDocumentBack?.uri) uploads.push(clientsApi.uploadImage(targetId, 'idDocumentBack', idDocumentBack));
      await Promise.all(uploads);
    }
  };

  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Modifier le client' : 'Nouveau client'}
      schema={schema}
      defaultValues={{
        fullName: client?.fullName ?? '',
        phone: client?.phone ?? '',
        email: client?.email ?? '',
        idNumber: client?.idNumber ?? '',
        address: client?.address ?? '',
        clientType: client?.clientType ?? 'INDIVIDUAL',
        loyaltyTier: client?.loyaltyTier ?? 'STANDARD',
        agencyId: client?.agencyId ?? '',
        emergencyContactName: client?.emergencyContactName ?? '',
        emergencyContactPhone: client?.emergencyContactPhone ?? '',
        emergencyContactRelation: client?.emergencyContactRelation ?? '',
        profile: null,
        idDocument: null,
        idDocumentBack: null,
      }}
      submit={submit}
      invalidate={[['clients']]}
      successMessage={isEdit ? 'Client mis a jour' : 'Client cree'}
      submitLabel={isEdit ? 'Enregistrer' : 'Creer'}
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="fullName" label="Nom complet" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppPhoneInput control={control} name="phone" label="Telephone" required />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="idNumber" label="CNI / Piece" />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="address" label="Adresse" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSelect control={control} name="clientType" label="Type" options={TYPE_OPTIONS} />
            </View>
            <View style={{ flex: 1 }}>
              <AppSelect control={control} name="loyaltyTier" label="Fidelite" options={TIER_OPTIONS} />
            </View>
          </View>
          <AppSearchSelect
            control={control}
            name="agencyId"
            label="Agence (optionnel)"
            search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
          />

          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700], marginTop: spacing.sm }}>Contact d'urgence</Text>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="emergencyContactName" label="Nom" />
            </View>
            <View style={{ flex: 1 }}>
              <AppPhoneInput control={control} name="emergencyContactPhone" label="Telephone" />
            </View>
          </View>
          <AppTextInput control={control} name="emergencyContactRelation" label="Lien de parente" />

          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700], marginTop: spacing.sm }}>Documents</Text>
          <ImageInput control={control} name="profile" label="Photo de profil" />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <ImageInput control={control} name="idDocument" label="CNI - Recto" />
            </View>
            <View style={{ flex: 1 }}>
              <ImageInput control={control} name="idDocumentBack" label="CNI - Verso" />
            </View>
          </View>
        </>
      )}
    </ResourceFormDialog>
  );
}
