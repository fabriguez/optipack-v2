import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';
import { TransitRouteFormDialog } from './TransitRouteFormDialog';

interface TransitRoute {
  id: string;
  name: string;
  type?: string | null;
  departureCity?: string | null;
  arrivalCity?: string | null;
  pricePerKg?: number | string;
  isActive?: boolean;
}

export default function TransitRoutesScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<TransitRoute>
        title="Routes transit"
        subtitle="Itineraires et tarifs"
        queryKey={['transit-routes']}
        fetcher={(params) => apiClient.get('/transit-routes', { params }).then((r) => r.data)}
        keyExtractor={(r) => r.id}
        createPermission="transit-route.manage"
        onCreate={() => setOpen(true)}
        renderRow={(r) => (
          <ListRow
            title={r.name}
            subtitle={`${r.departureCity ?? ''} → ${r.arrivalCity ?? ''}`}
            metadata={[r.type ?? '']}
            rightLabel={r.pricePerKg != null ? `${formatAmount(Number(r.pricePerKg))} /kg` : undefined}
            badge={r.isActive === false ? { label: 'Inactive', variant: 'error' } : undefined}
          />
        )}
      />
      <TransitRouteFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
