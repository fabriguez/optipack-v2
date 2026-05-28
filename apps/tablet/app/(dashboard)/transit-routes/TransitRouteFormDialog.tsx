import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSelect, AppSwitch, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  type: z.string().min(1, 'Type requis'),
  departureCity: z.string().min(1, 'Ville depart requise'),
  arrivalCity: z.string().min(1, 'Ville arrivee requise'),
  pricePerKg: z.string().min(1, 'Prix requis'),
  pricePerVolume: z.string().optional(),
  isActive: z.boolean().optional(),
});

export function TransitRouteFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouvelle route de transit"
      schema={schema}
      defaultValues={{ name: '', type: 'ROAD', departureCity: '', arrivalCity: '', pricePerKg: '', pricePerVolume: '', isActive: true }}
      submit={(v) =>
        apiClient.post('/transit-routes', {
          name: v.name,
          type: v.type,
          departureCity: v.departureCity,
          arrivalCity: v.arrivalCity,
          pricePerKg: Number(v.pricePerKg),
          pricePerVolume: v.pricePerVolume ? Number(v.pricePerVolume) : undefined,
          isActive: v.isActive ?? true,
        })
      }
      invalidate={[['transit-routes']]}
      successMessage="Route creee"
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="name" label="Nom" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSelect
                control={control}
                name="type"
                label="Type"
                required
                options={[
                  { value: 'ROAD', label: 'Routier' },
                  { value: 'AIR', label: 'Aerien' },
                  { value: 'SEA', label: 'Maritime' },
                ]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="pricePerKg" label="Prix /kg" required keyboardType="decimal-pad" />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="departureCity" label="Depart" required />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="arrivalCity" label="Arrivee" required />
            </View>
          </View>
          <AppTextInput control={control} name="pricePerVolume" label="Prix /m3" keyboardType="decimal-pad" />
          <AppSwitch control={control} name="isActive" label="Active" />
        </>
      )}
    </ResourceFormDialog>
  );
}
