import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { disbursementsApi } from '@/lib/api/finance';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  beneficiaryId: z.string().min(1, 'Beneficiaire requis'),
  amount: z.string().min(1, 'Montant requis'),
  reason: z.string().min(1, 'Motif requis'),
  reference: z.string().optional(),
});

export function DisbursementFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouveau decaissement"
      schema={schema}
      defaultValues={{ beneficiaryId: '', amount: '', reason: '', reference: '' }}
      submit={(v) =>
        disbursementsApi.create({
          beneficiaryId: v.beneficiaryId,
          amount: Number(v.amount),
          reason: v.reason,
          reference: v.reference || undefined,
        } as never)
      }
      invalidate={[['disbursements'], ['cash-register']]}
      successMessage="Decaissement enregistre"
    >
      {(control) => (
        <>
          <AppSearchSelect
            control={control}
            name="beneficiaryId"
            label="Beneficiaire"
            required
            search={(q) => searchers.employees(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
          />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="amount" label="Montant" required keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="reference" label="Reference" />
            </View>
          </View>
          <AppTextInput control={control} name="reason" label="Motif" multiline required />
        </>
      )}
    </ResourceFormDialog>
  );
}
