import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSelect, AppSwitch, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  designation: z.string().min(1, 'Designation requise'),
  type: z.string().min(1, 'Type requis'),
  status: z.string().optional(),
  isForwarding: z.boolean().optional(),
});

export function ContainerFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouveau conteneur"
      schema={schema}
      defaultValues={{ designation: '', type: 'STANDARD', status: 'OPEN', isForwarding: false }}
      submit={(v) => apiClient.post('/containers', v)}
      invalidate={[['containers']]}
      successMessage="Conteneur cree"
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="designation" label="Designation" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSelect
                control={control}
                name="type"
                label="Type"
                required
                options={[
                  { value: 'STANDARD', label: 'Standard' },
                  { value: 'REFRIGERATED', label: 'Refrigere' },
                  { value: 'OVERSIZED', label: 'Hors gabarit' },
                ]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppSelect
                control={control}
                name="status"
                label="Statut"
                options={[
                  { value: 'OPEN', label: 'Ouvert' },
                  { value: 'SEALED', label: 'Scelle' },
                  { value: 'IN_TRANSIT', label: 'En transit' },
                  { value: 'DELIVERED', label: 'Livre' },
                ]}
              />
            </View>
          </View>
          <AppSwitch control={control} name="isForwarding" label="Conteneur d'acheminement" />
        </>
      )}
    </ResourceFormDialog>
  );
}
