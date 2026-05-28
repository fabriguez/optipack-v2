import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppPhoneInput, ResourceFormDialog } from '@/components/forms';
import { agenciesApi } from '@/lib/api/agencies';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  city: z.string().min(1, 'Ville requise'),
  country: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
});

export function AgencyFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouvelle agence"
      schema={schema}
      defaultValues={{ name: '', city: '', country: '', address: '', phone: '', email: '' }}
      submit={(v) => agenciesApi.create(v as never)}
      invalidate={[['agencies']]}
      successMessage="Agence creee"
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="name" label="Nom" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="city" label="Ville" required />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="country" label="Pays" />
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
        </>
      )}
    </ResourceFormDialog>
  );
}
