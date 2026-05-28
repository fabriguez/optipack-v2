import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { fundTransfersApi } from '@/lib/api/finance';
import { searchers } from '@/lib/api/searchers';
import { spacing } from '@/lib/theme/spacing';

const schema = z
  .object({
    sourceAgencyId: z.string().min(1, 'Agence source requise'),
    targetAgencyId: z.string().min(1, 'Agence cible requise'),
    amount: z.string().min(1, 'Montant requis'),
    note: z.string().optional(),
  })
  .refine((v) => v.sourceAgencyId !== v.targetAgencyId, {
    message: 'Source et cible doivent differer',
    path: ['targetAgencyId'],
  });

export function FundTransferFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouveau transfert"
      schema={schema}
      defaultValues={{ sourceAgencyId: '', targetAgencyId: '', amount: '', note: '' }}
      submit={(v) =>
        fundTransfersApi.create({
          sourceAgencyId: v.sourceAgencyId,
          targetAgencyId: v.targetAgencyId,
          amount: Number(v.amount),
          note: v.note || undefined,
        } as never)
      }
      invalidate={[['fund-transfers'], ['cash-register']]}
      successMessage="Transfert cree"
    >
      {(control) => (
        <>
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppSearchSelect
                control={control}
                name="sourceAgencyId"
                label="Agence source"
                required
                search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <AppSearchSelect
                control={control}
                name="targetAgencyId"
                label="Agence cible"
                required
                search={(q) => searchers.agencies(q).then((items) => items.map((i) => ({ value: i.value, label: i.label, hint: i.sublabel ?? undefined })))}
              />
            </View>
          </View>
          <AppTextInput control={control} name="amount" label="Montant" required keyboardType="decimal-pad" />
          <AppTextInput control={control} name="note" label="Note" multiline />
        </>
      )}
    </ResourceFormDialog>
  );
}
