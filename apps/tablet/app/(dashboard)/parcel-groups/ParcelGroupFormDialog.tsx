import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSelect, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  name: z.string().min(1, 'Nom requis'),
  reference: z.string().optional(),
  type: z.string().optional(),
  notes: z.string().optional(),
});

export function ParcelGroupFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouveau groupe de colis"
      schema={schema}
      defaultValues={{ name: '', reference: '', type: 'SHIPMENT', notes: '' }}
      submit={(v) => apiClient.post('/parcel-groups', v)}
      invalidate={[['parcel-groups']]}
      successMessage="Groupe cree"
    >
      {(control) => (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="name" label="Nom" required />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="reference" label="Reference" />
            </View>
          </View>
          <AppSelect
            control={control}
            name="type"
            label="Type"
            options={[
              { value: 'SHIPMENT', label: 'Expedition' },
              { value: 'CONSOLIDATION', label: 'Consolidation' },
              { value: 'OTHER', label: 'Autre' },
            ]}
          />
          <AppTextInput control={control} name="notes" label="Notes" multiline />
        </>
      )}
    </ResourceFormDialog>
  );
}
