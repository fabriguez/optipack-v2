import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  location: z.string().min(1, 'Localisation requise'),
  agencyId: z.string().min(1, 'Agence requise'),
  capacity: z.string().optional(),
});

export function WarehouseFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouveau magasin"
      schema={schema}
      defaultValues={{ name: '', location: '', agencyId: '', capacity: '' }}
      submit={(v) =>
        apiClient.post('/warehouses', {
          name: v.name,
          location: v.location,
          agencyId: v.agencyId,
          capacity: v.capacity ? Number(v.capacity) : undefined,
        })
      }
      invalidate={[['warehouses']]}
      successMessage="Magasin cree"
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="name" label="Nom" required />
          <AppTextInput control={control} name="location" label="Localisation" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSearchSelect
                control={control}
                name="agencyId"
                label="Agence"
                required
                search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="capacity" label="Capacite" keyboardType="numeric" />
            </View>
          </View>
        </>
      )}
    </ResourceFormDialog>
  );
}
