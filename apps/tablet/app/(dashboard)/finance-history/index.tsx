import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';

interface FinanceEvent {
  id: string;
  label?: string | null;
  type?: string | null;
  amount?: number | string;
  createdAt?: string;
}

export default function FinanceHistoryScreen() {
  return (
    <ResourceListScreen<FinanceEvent>
      title="Historique financier"
      subtitle="Tous les mouvements financiers"
      queryKey={['finance-history']}
      fetcher={(params) => apiClient.get('/finance-history', { params }).then((r) => r.data)}
      keyExtractor={(e) => e.id}
      renderRow={(e) => (
        <ListRow
          title={e.label ?? e.id.slice(0, 8)}
          subtitle={e.type ?? undefined}
          metadata={[e.createdAt?.slice(0, 16) ?? '']}
          rightLabel={e.amount != null ? formatAmount(Number(e.amount)) : undefined}
        />
      )}
    />
  );
}
