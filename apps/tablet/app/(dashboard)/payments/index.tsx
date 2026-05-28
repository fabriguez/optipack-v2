import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';
import { PaymentFormDialog } from './PaymentFormDialog';

interface Payment {
  id: string;
  reference?: string | null;
  amount: number | string;
  status?: string | null;
  client?: { fullName?: string } | null;
  paymentMethod?: { name?: string } | null;
  createdAt?: string;
}

export default function PaymentsScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Payment>
        title="Paiements"
        subtitle="Historique des reglements"
        queryKey={['payments']}
        fetcher={(params) => apiClient.get('/payments', { params }).then((r) => r.data)}
        keyExtractor={(p) => p.id}
        createPermission="payment.record"
        onCreate={() => setOpen(true)}
        renderRow={(p) => (
          <ListRow
            title={p.reference ?? p.id.slice(0, 8)}
            subtitle={p.client?.fullName ?? undefined}
            metadata={[p.paymentMethod?.name ?? '', p.createdAt?.slice(0, 10) ?? '']}
            rightLabel={formatAmount(Number(p.amount))}
            badge={p.status ? { label: p.status, variant: p.status === 'CONFIRMED' ? 'success' : 'default' } : undefined}
          />
        )}
      />
      <PaymentFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
