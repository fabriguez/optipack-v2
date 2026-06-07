import { View, Text } from 'react-native';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard, StatCard } from '../_components';
import { Badge } from '@/components/ui/Badge';
import { useAgencyPayments, useAgencyDisbursements } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

export function FinanceTab({ agencyId, cash }: { agencyId: string; cash: any }) {
  const { data: paymentsData } = useAgencyPayments(agencyId);
  const { data: disbursementsData } = useAgencyDisbursements(agencyId);

  const payments = paymentsData?.data ?? [];
  const disbursements = disbursementsData?.data ?? [];

  const paymentColumns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 160, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'amount', label: 'Montant', width: 140, render: (r) => <Text style={{ fontWeight: '700', color: colors.primary[700] }}>{formatAmount(Number(r.amount))}</Text> },
    { key: 'isVoided', label: 'Statut', width: 110, render: (r) => <Badge variant={r.isVoided ? 'error' : 'success'}>{r.isVoided ? 'Annule' : 'Valide'}</Badge> },
    { key: 'createdAt', label: 'Date', width: 140, render: (r) => <Text style={{ fontSize: 13, color: colors.gray[600] }}>{formatDate(r.createdAt)}</Text> },
  ];

  const disbursementColumns: Column<any>[] = [
    { key: 'reference', label: 'Reference', width: 150, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 12, color: colors.primary[700] }}>{r.reference}</Text> },
    { key: 'reason', label: 'Motif', width: 200 },
    { key: 'amount', label: 'Montant', width: 140, render: (r) => <Text style={{ fontWeight: '700', color: colors.error }}>-{formatAmount(Number(r.amount))}</Text> },
    { key: 'isVoided', label: 'Statut', width: 110, render: (r) => <Badge variant={r.isVoided ? 'error' : 'success'}>{r.isVoided ? 'Annule' : 'Valide'}</Badge> },
    { key: 'createdAt', label: 'Date', width: 140, render: (r) => <Text style={{ fontSize: 13, color: colors.gray[600] }}>{formatDate(r.createdAt)}</Text> },
  ];

  return (
    <View style={{ gap: spacing.xl }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
        <StatCard label="Solde caisse" value={cash ? formatAmount(Number(cash.currentBalance)) : '-'} color={colors.primary[700]} hint={cash?.isClosed ? 'Cloturee' : 'Ouverte'} />
        <StatCard label="Entrees du jour" value={`+${cash ? formatAmount(Number(cash.totalEntries)) : '0'}`} color={colors.primary[600]} />
        <StatCard label="Sorties du jour" value={`-${cash ? formatAmount(Number(cash.totalExits)) : '0'}`} color={colors.error} />
      </View>

      <SectionCard title={`Paiements recents (${paymentsData?.meta?.total ?? payments.length})`}>
        <AppDataTable columns={paymentColumns} data={payments} emptyMessage="Aucun paiement" />
      </SectionCard>

      <SectionCard title={`Sorties / Decaissements (${disbursementsData?.meta?.total ?? disbursements.length})`}>
        <AppDataTable columns={disbursementColumns} data={disbursements} emptyMessage="Aucune sortie" />
      </SectionCard>
    </View>
  );
}
