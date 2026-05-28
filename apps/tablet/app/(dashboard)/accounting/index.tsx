import { ResourceListScreen } from '@/components/data/ResourceListScreen';
import { ListRow } from '@/components/data/ListRow';
import { accountingApi } from '@/lib/api/finance';
import { formatAmount } from '@transitsoftservices/shared';

interface LedgerEntry {
  id: string;
  reference?: string | null;
  label?: string | null;
  debit?: number | string;
  credit?: number | string;
  sourceType?: string | null;
  createdAt?: string;
}

export default function AccountingScreen() {
  return (
    <ResourceListScreen<LedgerEntry>
      title="Comptabilite"
      subtitle="Livre des ecritures"
      queryKey={['accounting']}
      fetcher={(params) => accountingApi.getLedger(params)}
      keyExtractor={(e) => e.id}
      renderRow={(e) => {
        const debit = Number(e.debit ?? 0);
        const credit = Number(e.credit ?? 0);
        const amount = debit > 0 ? -debit : credit;
        return (
          <ListRow
            title={e.label ?? e.reference ?? e.id.slice(0, 8)}
            subtitle={e.sourceType ?? undefined}
            metadata={[e.createdAt?.slice(0, 10) ?? '']}
            rightLabel={`${amount >= 0 ? '+' : ''}${formatAmount(amount)}`}
          />
        );
      }}
    />
  );
}
