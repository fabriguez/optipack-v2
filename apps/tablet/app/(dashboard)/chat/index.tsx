import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';

interface Conversation {
  id: string;
  client?: { fullName?: string } | null;
  lastMessage?: { content?: string; createdAt?: string } | null;
  unreadCount?: number;
}

export default function ChatScreen() {
  return (
    <ResourceListScreen<Conversation>
      title="Support"
      subtitle="Conversations clients"
      queryKey={['chat', 'conversations']}
      fetcher={(params) => apiClient.get('/chat/conversations', { params }).then((r) => r.data)}
      keyExtractor={(c) => c.id}
      renderRow={(c) => (
        <ListRow
          title={c.client?.fullName ?? c.id.slice(0, 8)}
          subtitle={c.lastMessage?.content ?? undefined}
          metadata={[c.lastMessage?.createdAt?.slice(0, 16) ?? '']}
          badge={c.unreadCount && c.unreadCount > 0 ? { label: `${c.unreadCount}`, variant: 'warning' } : undefined}
        />
      )}
    />
  );
}
