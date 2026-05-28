import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';

interface LoyaltyEntry {
  id: string;
  client?: { fullName?: string } | null;
  tier?: string | null;
  points?: number;
  totalSpent?: number | string;
}

export default function LoyaltyScreen() {
  return (
    <ResourceListScreen<LoyaltyEntry>
      title="Fidelite"
      subtitle="Programme et paliers"
      queryKey={['loyalty']}
      fetcher={(params) => apiClient.get('/loyalty', { params }).then((r) => r.data)}
      keyExtractor={(l) => l.id}
      renderRow={(l) => (
        <ListRow
          title={l.client?.fullName ?? l.id.slice(0, 8)}
          subtitle={l.tier ?? undefined}
          metadata={[l.points != null ? `${l.points} pts` : '']}
          rightLabel={l.totalSpent != null ? String(l.totalSpent) : undefined}
        />
      )}
    />
  );
}
