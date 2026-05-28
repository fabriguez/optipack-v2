import { useState } from 'react';
import { useRouter } from 'expo-router';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { ParcelFormDialog } from './ParcelFormDialog';
import { parcelsApi } from '@/lib/api/parcels';
import { formatAmount } from '@transitsoftservices/shared';

interface Parcel {
  id: string;
  trackingNumber: string;
  designation: string;
  status: string;
  price?: number | string | null;
  weight?: number | string | null;
  client?: { fullName?: string } | null;
}

const statusVariant = (s: string) =>
  s === 'DELIVERED' ? 'success' : s === 'IN_TRANSIT' ? 'warning' : 'default';

export default function ParcelsScreen() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Parcel>
        title="Colis"
        subtitle="Suivi et gestion des colis"
        queryKey={['parcels']}
        fetcher={(params) => parcelsApi.list(params)}
        keyExtractor={(p) => p.id}
        createPermission="parcel.create"
        onCreate={() => setOpen(true)}
        searchPlaceholder="Rechercher tracking / designation..."
        renderRow={(p) => (
          <ListRow
            title={p.trackingNumber}
            subtitle={p.designation}
            metadata={[p.client?.fullName ?? '-', p.weight ? `${p.weight} kg` : '']}
            rightLabel={formatAmount(Number(p.price ?? 0))}
            badge={{ label: p.status, variant: statusVariant(p.status) }}
            onPress={() => router.push(`/(dashboard)/parcels/${p.id}` as never)}
          />
        )}
      />
      <ParcelFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
