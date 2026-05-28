import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { agenciesApi } from '@/lib/api/agencies';
import { AgencyFormDialog } from './AgencyFormDialog';

interface Agency {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  address?: string | null;
  phone?: string | null;
}

export default function AgenciesScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Agency>
        title="Agences"
        subtitle="Reseau des agences"
        queryKey={['agencies']}
        fetcher={(params) => agenciesApi.list(params)}
        keyExtractor={(a) => a.id}
        createPermission="agency.manage"
        onCreate={() => setOpen(true)}
        renderRow={(a) => (
          <ListRow title={a.name} subtitle={a.address ?? undefined} metadata={[a.city ?? '', a.country ?? '', a.phone ?? '']} />
        )}
      />
      <AgencyFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
