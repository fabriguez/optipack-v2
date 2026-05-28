import { useState } from 'react';
import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { disbursementsApi } from '@/lib/api/finance';
import { formatAmount } from '@transitsoftservices/shared';
import { DisbursementFormDialog } from './DisbursementFormDialog';

interface Disbursement {
  id: string;
  reference?: string | null;
  amount: number | string;
  reason?: string | null;
  status?: string | null;
  beneficiary?: { fullName?: string } | string | null;
  createdAt?: string;
}

function beneficiaryLabel(b: Disbursement['beneficiary']): string {
  if (!b) return '';
  if (typeof b === 'string') return b;
  return b.fullName ?? '';
}

export default function DisbursementsScreen() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <ResourceListScreen<Disbursement>
        title="Decaissements"
        subtitle="Sorties de caisse"
        queryKey={['disbursements']}
        fetcher={(params) => disbursementsApi.list(params)}
        keyExtractor={(d) => d.id}
        createPermission="disbursement.order"
        onCreate={() => setOpen(true)}
        renderRow={(d) => (
          <ListRow
            title={d.reference ?? d.id.slice(0, 8)}
            subtitle={d.reason ?? undefined}
            metadata={[beneficiaryLabel(d.beneficiary), d.createdAt?.slice(0, 10) ?? '']}
            rightLabel={formatAmount(Number(d.amount))}
            badge={d.status ? { label: d.status, variant: d.status === 'VOIDED' ? 'error' : d.status === 'CONFIRMED' ? 'success' : 'warning' } : undefined}
          />
        )}
      />
      <DisbursementFormDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
