import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { WarehouseFormDialog } from './WarehouseFormDialog';

interface Warehouse {
  id: string;
  name: string;
  location?: string | null;
  agency?: { name?: string } | null;
  capacity?: number | null;
}

export default function WarehousesScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Warehouse>
        title="Magasins"
        subtitle="Lieux de stockage"
        queryKey={['warehouses']}
        fetcher={(params) => apiClient.get('/warehouses', { params }).then((r) => r.data)}
        keyExtractor={(w) => w.id}
        createPermission="warehouse.manage"
        onCreate={() => setOpen(true)}
        renderRow={(w) => (
          <ListRow title={w.name} subtitle={w.location ?? undefined} metadata={[w.agency?.name ?? '', w.capacity ? `Capacite ${w.capacity}` : '']} />
        )}
      />
      <WarehouseFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
