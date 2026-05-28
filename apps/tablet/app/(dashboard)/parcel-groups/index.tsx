import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { ParcelGroupFormDialog } from './ParcelGroupFormDialog';

interface ParcelGroup {
  id: string;
  name?: string | null;
  reference?: string | null;
  status?: string | null;
  parcelsCount?: number;
  createdAt?: string;
}

export default function ParcelGroupsScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<ParcelGroup>
        title="Groupes de colis"
        subtitle="Regroupement logistique"
        queryKey={['parcel-groups']}
        fetcher={(params) => apiClient.get('/parcel-groups', { params }).then((r) => r.data)}
        keyExtractor={(g) => g.id}
        createPermission="parcel-group.manage"
        onCreate={() => setOpen(true)}
        renderRow={(g) => (
          <ListRow
            title={g.name ?? g.reference ?? g.id.slice(0, 8)}
            subtitle={g.reference ?? undefined}
            metadata={[g.parcelsCount != null ? `${g.parcelsCount} colis` : '', g.createdAt?.slice(0, 10) ?? '']}
            badge={g.status ? { label: g.status } : undefined}
          />
        )}
      />
      <ParcelGroupFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
