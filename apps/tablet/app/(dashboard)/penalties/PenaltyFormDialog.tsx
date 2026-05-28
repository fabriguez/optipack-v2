import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  employeeId: z.string().min(1, 'Employe requis'),
  amount: z.string().min(1, 'Montant requis'),
  reason: z.string().min(1, 'Motif requis'),
});

export function PenaltyFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouvelle penalite"
      schema={schema}
      defaultValues={{ employeeId: '', amount: '', reason: '' }}
      submit={(v) =>
        apiClient.post('/penalties', {
          employeeId: v.employeeId,
          amount: Number(v.amount),
          reason: v.reason,
        })
      }
      invalidate={[['penalties']]}
      successMessage="Penalite enregistree"
    >
      {(control) => (
        <>
          <AppSearchSelect
            control={control}
            name="employeeId"
            label="Employe"
            required
            search={(q) => searchers.employees(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
          />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="amount" label="Montant" required keyboardType="decimal-pad" />
            </View>
          </View>
          <AppTextInput control={control} name="reason" label="Motif" multiline required />
        </>
      )}
    </ResourceFormDialog>
  );
}
