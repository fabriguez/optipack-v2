import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';

interface Debt {
  id: string;
  amount: number | string;
  paidAmount?: number | string;
  client?: { fullName?: string } | null;
  status?: string | null;
  dueDate?: string;
  createdAt?: string;
}

export default function DebtsScreen() {
  return (
    <ResourceListScreen<Debt>
      title="Dettes"
      subtitle="Encours clients"
      queryKey={['debts']}
      fetcher={(params) => apiClient.get('/debts', { params }).then((r) => r.data)}
      keyExtractor={(d) => d.id}
      renderRow={(d) => {
        const remaining = Number(d.amount) - Number(d.paidAmount ?? 0);
        return (
          <ListRow
            title={d.client?.fullName ?? d.id.slice(0, 8)}
            subtitle={d.dueDate ? `Echeance ${d.dueDate.slice(0, 10)}` : undefined}
            metadata={[d.createdAt?.slice(0, 10) ?? '']}
            rightLabel={formatAmount(remaining)}
            badge={d.status ? { label: d.status, variant: d.status === 'PAID' ? 'success' : d.status === 'OVERDUE' ? 'error' : 'warning' } : undefined}
          />
        );
      }}
    />
  );
}
