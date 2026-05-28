import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';

interface Notification {
  id: string;
  title?: string | null;
  body?: string | null;
  type?: string | null;
  readAt?: string | null;
  createdAt?: string;
}

export default function NotificationsScreen() {
  return (
    <ResourceListScreen<Notification>
      title="Notifications"
      subtitle="Messages et alertes"
      queryKey={['notifications']}
      fetcher={(params) => apiClient.get('/notifications', { params }).then((r) => r.data)}
      keyExtractor={(n) => n.id}
      renderRow={(n) => (
        <ListRow
          title={n.title ?? '(sans titre)'}
          subtitle={n.body ?? undefined}
          metadata={[n.type ?? '', n.createdAt?.slice(0, 16) ?? '']}
          badge={!n.readAt ? { label: 'Nouveau', variant: 'warning' } : undefined}
        />
      )}
    />
  );
}
