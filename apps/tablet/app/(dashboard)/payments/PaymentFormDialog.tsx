import { z } from 'zod';
import { View } from 'react-native';
import { AppTextInput, AppSearchSelect, ResourceFormDialog } from '@/components/forms';
import { apiClient } from '@/lib/api/client';
import { spacing } from '@/lib/theme/spacing';

const schema = z.object({
  invoiceId: z.string().min(1, 'Facture requise'),
  amount: z.string().min(1, 'Montant requis'),
  paymentMethodId: z.string().min(1, 'Methode requise'),
  reference: z.string().optional(),
  note: z.string().optional(),
});

async function searchInvoices(q: string) {
  const { data } = await apiClient.get('/invoices', { params: { search: q, limit: 10 } });
  const items = (data?.data ?? []) as Array<{ id: string; number?: string; total: number; client?: { fullName?: string } }>;
  return items.map((i) => ({ value: i.id, label: i.number ?? i.id.slice(0, 8), hint: i.client?.fullName }));
}

async function searchMethods(q: string) {
  const { data } = await apiClient.get('/payment-methods', { params: { search: q, limit: 10 } });
  const items = (data?.data ?? []) as Array<{ id: string; name: string; provider?: string }>;
  return items.map((m) => ({ value: m.id, label: m.name, hint: m.provider }));
}

export function PaymentFormDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ResourceFormDialog
      open={open}
      onClose={onClose}
      title="Nouveau paiement"
      schema={schema}
      defaultValues={{ invoiceId: '', amount: '', paymentMethodId: '', reference: '', note: '' }}
      submit={(v) =>
        apiClient.post('/payments', {
          invoiceId: v.invoiceId,
          amount: Number(v.amount),
          paymentMethodId: v.paymentMethodId,
          reference: v.reference || undefined,
          note: v.note || undefined,
        })
      }
      invalidate={[['payments'], ['invoices']]}
      successMessage="Paiement enregistre"
    >
      {(control) => (
        <>
          <AppSearchSelect control={control} name="invoiceId" label="Facture" required search={searchInvoices} />
          <View style={{ flexDirection: 'row', gap: spacing.lg }}>
            <View style={{ flex: 1 }}>
              <AppTextInput control={control} name="amount" label="Montant" required keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <AppSearchSelect control={control} name="paymentMethodId" label="Methode" required search={searchMethods} />
            </View>
          </View>
          <AppTextInput control={control} name="reference" label="Reference" />
          <AppTextInput control={control} name="note" label="Note" multiline />
        </>
      )}
    </ResourceFormDialog>
  );
}
