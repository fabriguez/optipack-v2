import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { fundTransfersApi } from '@/lib/api/finance';
import { formatAmount } from '@transitsoftservices/shared';
import { FundTransferFormDialog } from './FundTransferFormDialog';

interface FundTransfer {
  id: string;
  reference?: string | null;
  amount: number | string;
  status?: string | null;
  sourceAgency?: { name?: string } | null;
  targetAgency?: { name?: string } | null;
  createdAt?: string;
}

export default function FundTransfersScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<FundTransfer>
        title="Transferts"
        subtitle="Mouvements inter-agences"
        queryKey={['fund-transfers']}
        fetcher={(params) => fundTransfersApi.list(params)}
        keyExtractor={(t) => t.id}
        createPermission="fund-transfer.create"
        onCreate={() => setOpen(true)}
        renderRow={(t) => (
          <ListRow
            title={t.reference ?? t.id.slice(0, 8)}
            subtitle={`${t.sourceAgency?.name ?? '-'} → ${t.targetAgency?.name ?? '-'}`}
            metadata={[t.createdAt?.slice(0, 10) ?? '']}
            rightLabel={formatAmount(Number(t.amount))}
            badge={t.status ? { label: t.status, variant: t.status === 'CONFIRMED' ? 'success' : 'warning' } : undefined}
          />
        )}
      />
      <FundTransferFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
