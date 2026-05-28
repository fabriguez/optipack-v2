import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { ContainerFormDialog } from './ContainerFormDialog';

interface Container {
  id: string;
  designation: string;
  type?: string | null;
  status?: string | null;
  isForwarding?: boolean;
}

export default function ContainersScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Container>
        title="Conteneurs"
        subtitle="Suivi des conteneurs"
        queryKey={['containers']}
        fetcher={(params) => apiClient.get('/containers', { params }).then((r) => r.data)}
        keyExtractor={(c) => c.id}
        createPermission="container.manage"
        onCreate={() => setOpen(true)}
        renderRow={(c) => (
          <ListRow
            title={c.designation}
            subtitle={c.type ?? undefined}
            metadata={[c.isForwarding ? 'Acheminement' : '']}
            badge={c.status ? { label: c.status } : undefined}
          />
        )}
      />
      <ContainerFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
