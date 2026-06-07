import { View, Text, Alert } from 'react-native';
import { formatDate } from '@transitsoftservices/shared';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard } from '../_components';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAgencyPendingLeaves, useValidateLeave } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';

const TYPE_LABEL: Record<string, string> = {
  PAID: 'Paye',
  UNPAID: 'Non paye',
  SICK: 'Maladie',
  MATERNITY: 'Maternite',
  PATERNITY: 'Paternite',
  EXCEPTIONAL: 'Exceptionnel',
};

export function LeavesTab({ agencyId }: { agencyId: string }) {
  const { data } = useAgencyPendingLeaves(agencyId);
  const validate = useValidateLeave(agencyId);

  const leaves: any[] = data?.data ?? data ?? [];

  const approve = (leaveId: string) => {
    if (typeof Alert.prompt === 'function') {
      Alert.prompt('Commentaire (optionnel)', undefined, (comment) => {
        validate.mutate({ leaveId, data: { decision: 'APPROVED', comment: comment || undefined } });
      });
    } else {
      validate.mutate({ leaveId, data: { decision: 'APPROVED' } });
    }
  };

  const reject = (leaveId: string) => {
    if (typeof Alert.prompt === 'function') {
      Alert.prompt('Motif du refus', undefined, (comment) => {
        validate.mutate({ leaveId, data: { decision: 'REJECTED', comment: comment || 'Refuse' } });
      });
    } else {
      validate.mutate({ leaveId, data: { decision: 'REJECTED', comment: 'Refuse' } });
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'employee',
      label: 'Employe',
      width: 200,
      render: (r) => (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{r.employee?.fullName ?? '-'}</Text>
          <Text style={{ fontSize: 12, color: colors.gray[400] }}>{r.employee?.position ?? ''}</Text>
        </View>
      ),
    },
    { key: 'type', label: 'Type', width: 120, render: (r) => <Badge>{TYPE_LABEL[r.type] ?? r.type}</Badge> },
    { key: 'fromDate', label: 'Du', width: 120, render: (r) => <Text style={{ fontSize: 13 }}>{formatDate(r.fromDate)}</Text> },
    { key: 'toDate', label: 'Au', width: 120, render: (r) => <Text style={{ fontSize: 13 }}>{formatDate(r.toDate)}</Text> },
    { key: 'reason', label: 'Motif', width: 180, render: (r) => <Text style={{ fontSize: 13, color: colors.gray[600] }} numberOfLines={2}>{r.reason || '-'}</Text> },
    {
      key: 'actions',
      label: '',
      width: 200,
      render: (r) => (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Button size="sm" onPress={() => approve(r.id)}>Approuver</Button>
          <Button size="sm" variant="destructive" onPress={() => reject(r.id)}>Refuser</Button>
        </View>
      ),
    },
  ];

  return (
    <SectionCard title={`Conges en attente (${leaves.length})`}>
      <AppDataTable columns={columns} data={leaves} emptyMessage="Aucune demande en attente" />
    </SectionCard>
  );
}
