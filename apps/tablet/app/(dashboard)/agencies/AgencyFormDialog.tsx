import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppPhoneInput, AppSearchSelect, ImageInput, ResourceFormDialog } from '@/components/forms';
import { agenciesApi } from '@/lib/api/agencies';
import { COUNTRIES } from '@/lib/data/countries';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  city: z.string().min(1, 'Ville requise'),
  country: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  googleMapsLink: z.string().optional().or(z.literal('')),
  image: z.any().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Agency {
  id: string;
  name?: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  googleMapsLink?: string | null;
}

export function AgencyFormDialog({
  open,
  onClose,
  agency,
}: {
  open: boolean;
  onClose: () => void;
  agency?: Agency;
}) {
  const isEdit = !!agency;

  const submit = async (v: FormValues) => {
    const { image, ...rest } = v;
    const payload = { ...rest, email: rest.email || undefined, googleMapsLink: rest.googleMapsLink || undefined };
    if (isEdit) {
      const res = await agenciesApi.update(agency!.id, payload as never);
      if (image?.uri) await agenciesApi.uploadImage(agency!.id, image);
      return res;
    }
    const created = await agenciesApi.create(payload as never);
    const newId = created?.data?.id ?? created?.id;
    if (newId && image?.uri) await agenciesApi.uploadImage(newId, image);
    return created;
  };

  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title={isEdit ? "Modifier l'agence" : 'Nouvelle agence'}
      schema={schema}
      defaultValues={{
        name: agency?.name ?? '',
        city: agency?.city ?? '',
        country: agency?.country ?? '',
        address: agency?.address ?? '',
        phone: agency?.phone ?? '',
        email: agency?.email ?? '',
        googleMapsLink: agency?.googleMapsLink ?? '',
        image: null,
      }}
      submit={submit}
      invalidate={[['agencies']]}
      successMessage={isEdit ? 'Agence mise a jour' : 'Agence creee'}
      submitLabel={isEdit ? 'Enregistrer' : 'Creer'}
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="name" label="Nom" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="city" label="Ville" required />
            </View>
            <View style={{ flex: 1 }}>
              <AppSearchSelect control={control} name="country" label="Pays" items={COUNTRIES} />
            </View>
          </View>
          <AppTextInput control={control} name="address" label="Adresse" />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppPhoneInput control={control} name="phone" label="Telephone" />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="email" label="Email" keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>
          <AppTextInput control={control} name="googleMapsLink" label="Lien Google Maps" autoCapitalize="none" />
          <ImageInput control={control} name="image" label="Image de l'agence" />
        </>
      )}
    </ResourceFormDialog>
  );
}
