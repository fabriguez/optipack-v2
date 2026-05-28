import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppPhoneInput, AppSelect, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  carrierType: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
});

export function CarrierFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouveau transporteur"
      schema={schema}
      defaultValues={{ name: '', carrierType: 'ROAD', phone: '', email: '' }}
      submit={(v) => apiClient.post('/carriers', v)}
      invalidate={[['carriers']]}
      successMessage="Transporteur cree"
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="name" label="Nom" required />
          <AppSelect
            control={control}
            name="carrierType"
            label="Type"
            options={[
              { value: 'ROAD', label: 'Routier' },
              { value: 'AIR', label: 'Aerien' },
              { value: 'SEA', label: 'Maritime' },
              { value: 'RAIL', label: 'Ferroviaire' },
            ]}
          />
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
