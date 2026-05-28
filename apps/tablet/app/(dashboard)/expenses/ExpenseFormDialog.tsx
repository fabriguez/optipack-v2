import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  label: z.string().min(1, 'Libelle requis'),
  amount: z.string().min(1, 'Montant requis'),
  category: z.string().optional(),
  agencyId: z.string().min(1, 'Agence requise'),
  note: z.string().optional(),
});

export function ExpenseFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouvelle depense"
      schema={schema}
      defaultValues={{ label: '', amount: '', category: '', agencyId: '', note: '' }}
      submit={(v) =>
        apiClient.post('/expenses', {
          label: v.label,
          amount: Number(v.amount),
          category: v.category || undefined,
          agencyId: v.agencyId,
          note: v.note || undefined,
        })
      }
      invalidate={[['expenses'], ['cash-register']]}
      successMessage="Depense enregistree"
    >
      {(control) => (
        <>
          <AppTextInput control={control} name="label" label="Libelle" required />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="amount" label="Montant" required keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="category" label="Categorie" />
            </View>
          </View>
          <AppSearchSelect
            control={control}
            name="agencyId"
            label="Agence"
            required
            search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
          />
          <AppTextInput control={control} name="note" label="Note" multiline />
        </>
      )}
    </ResourceFormDialog>
  );
}
