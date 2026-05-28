import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { apiClient } from '@/lib/api/client';
import { formatAmount } from '@transitsoftservices/shared';
import { PenaltyFormDialog } from './PenaltyFormDialog';

interface Penalty {
  id: string;
  reference?: string | null;
  amount: number | string;
  reason?: string | null;
  status?: string | null;
  employee?: { fullName?: string } | null;
  createdAt?: string;
}

export default function PenaltiesScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Penalty>
        title="Penalites"
        subtitle="Sanctions et amendes"
        queryKey={['penalties']}
        fetcher={(params) => apiClient.get('/penalties', { params }).then((r) => r.data)}
        keyExtractor={(p) => p.id}
        createPermission="penalty.create"
        onCreate={() => setOpen(true)}
        renderRow={(p) => (
          <ListRow
            title={p.reference ?? p.id.slice(0, 8)}
            subtitle={p.reason ?? undefined}
            metadata={[p.employee?.fullName ?? '', p.createdAt?.slice(0, 10) ?? '']}
            rightLabel={formatAmount(Number(p.amount))}
            badge={p.status ? { label: p.status } : undefined}
          />
        )}
      />
      <PenaltyFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
