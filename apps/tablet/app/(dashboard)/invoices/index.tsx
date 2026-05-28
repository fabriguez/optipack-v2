import { useRouter } from 'expo-router';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';

interface Invoice {
  id: string;
  number?: string | null;
  total: number | string;
  paidAmount?: number | string;
  status?: string | null;
  client?: { fullName?: string } | null;
  createdAt?: string;
}

export default function InvoicesScreen() {
  const router = useRouter();
  return (
    <ResourceListScreen<Invoice>
      title="Factures"
      subtitle="Toutes les factures"
      queryKey={['invoices']}
      fetcher={(params) => apiClient.get('/invoices', { params }).then((r) => r.data)}
      keyExtractor={(i) => i.id}
      createPermission="invoice.create"
      renderRow={(i) => (
        <ListRow
          title={i.number ?? i.id.slice(0, 8)}
          subtitle={i.client?.fullName ?? undefined}
          metadata={[i.createdAt?.slice(0, 10) ?? '']}
          rightLabel={formatAmount(Number(i.total))}
          badge={i.status ? { label: i.status, variant: i.status === 'PAID' ? 'success' : i.status === 'OVERDUE' ? 'error' : 'warning' } : undefined}
          onPress={() => router.push(`/(dashboard)/invoices/${i.id}` as never)}
        />
      )}
    />
  );
}
