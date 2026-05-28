import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { CarrierFormDialog } from './CarrierFormDialog';

interface Carrier {
  id: string;
  name: string;
  carrierType?: string | null;
  phone?: string | null;
  email?: string | null;
}

export default function CarriersScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Carrier>
        title="Transporteurs"
        subtitle="Prestataires de transport"
        queryKey={['carriers']}
        fetcher={(params) => apiClient.get('/carriers', { params }).then((r) => r.data)}
        keyExtractor={(c) => c.id}
        createPermission="carrier.manage"
        onCreate={() => setOpen(true)}
        renderRow={(c) => (
          <ListRow title={c.name} subtitle={c.carrierType ?? undefined} metadata={[c.phone ?? '', c.email ?? '']} />
        )}
      />
      <CarrierFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
