import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';

interface AuditEntry {
  id: string;
  action?: string | null;
  entity?: string | null;
  user?: { email?: string; fullName?: string } | null;
  createdAt?: string;
}

export default function AuditLogScreen() {
  return (
    <ResourceListScreen<AuditEntry>
      title="Audit"
      subtitle="Journal d'activite"
      queryKey={['audit']}
      fetcher={(params) => apiClient.get('/audit', { params }).then((r) => r.data)}
      keyExtractor={(a) => a.id}
      renderRow={(a) => (
        <ListRow
          title={`${a.action ?? ''} ${a.entity ?? ''}`.trim() || a.id.slice(0, 8)}
          subtitle={a.user?.fullName ?? a.user?.email ?? undefined}
          metadata={[a.createdAt?.slice(0, 16) ?? '']}
        />
      )}
    />
  );
}
