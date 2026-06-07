import { useState } from 'react';
import { View, Text, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { SectionCard } from '../_components';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useAgencyAttendance, useAttendanceMutations } from '@/lib/hooks/useAgencyDetail';
import { colors } from '@/lib/theme/colors';
import { radius, spacing } from '@/lib/theme/spacing';

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'error',
  ON_LEAVE: 'default',
  HOLIDAY: 'default',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AttendanceTab({ agencyId }: { agencyId: string }) {
  const [date, setDate] = useState(today());
  const { data } = useAgencyAttendance(agencyId, date);
  const { mark, checkOut } = useAttendanceMutations(agencyId, date);

  const payload = data?.data ?? data;
  const employees: any[] = payload?.employees ?? [];
  const isToday = date === today();

  const markAbsent = (employeeId: string) => {
    if (typeof Alert.prompt === 'function') {
      Alert.prompt('Motif d\'absence', undefined, (reason) => {
        mark.mutate({ employeeId, data: { status: 'ABSENT', reason: reason || 'Absent' } });
      });
    } else {
      mark.mutate({ employeeId, data: { status: 'ABSENT', reason: 'Absent' } });
    }
  };

  const columns: Column<any>[] = [
    {
      key: 'fullName',
      label: 'Employe',
      width: 200,
      render: (r) => (
        <View>
          <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{r.fullName}</Text>
          <Text style={{ fontSize: 12, color: colors.gray[400] }}>{r.position ?? '-'}</Text>
        </View>
      ),
    },
    {
      key: 'status',
      label: 'Statut',
      width: 120,
      render: (r) => {
        const a = r.attendances?.[0];
        const status = a?.status ?? 'ABSENT';
        return <Badge variant={STATUS_VARIANT[status] ?? 'default'}>{status}</Badge>;
      },
    },
    {
      key: 'arrival',
      label: 'Arrivee',
      width: 130,
      render: (r) => {
        const a = r.attendances?.[0];
        return <Text style={{ fontSize: 13, color: colors.gray[600] }}>{a?.checkInTime ?? '-'}{a?.expectedStart ? ` / ${a.expectedStart}` : ''}</Text>;
      },
    },
    {
      key: 'departure',
      label: 'Depart',
      width: 130,
      render: (r) => {
        const a = r.attendances?.[0];
        return <Text style={{ fontSize: 13, color: colors.gray[600] }}>{a?.checkOutTime ?? '-'}{a?.expectedEnd ? ` / ${a.expectedEnd}` : ''}</Text>;
      },
    },
    {
      key: 'late',
      label: 'Retard (min)',
      width: 110,
      align: 'center',
      render: (r) => <Text style={{ fontSize: 13 }}>{r.attendances?.[0]?.lateMinutes ?? 0}</Text>,
    },
    {
      key: 'actions',
      label: '',
      width: 230,
      render: (r) =>
        isToday ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Button size="sm" onPress={() => mark.mutate({ employeeId: r.id, data: { status: 'PRESENT', checkInTime: nowHHmm() } })}>Pointer</Button>
            <Button size="sm" variant="outline" onPress={() => checkOut.mutate({ employeeId: r.id, data: { checkOutTime: nowHHmm() } })}>Sortie</Button>
            <Button size="sm" variant="destructive" onPress={() => markAbsent(r.id)}>Absent</Button>
          </View>
        ) : (
          <Text style={{ fontSize: 12, color: colors.gray[400] }}>-</Text>
        ),
    },
  ];

  return (
    <SectionCard
      title="Pointage"
      subtitle={isToday ? "Aujourd'hui" : 'Consultation (jour passe)'}
      action={<Button size="sm" variant="outline" onPress={() => setDate(today())}>Aujourd'hui</Button>}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg }}>
        <Ionicons name="calendar-outline" size={18} color={colors.gray[400]} />
        <TextInput
          value={date}
          onChangeText={setDate}
          placeholder="AAAA-MM-JJ"
          placeholderTextColor={colors.gray[400]}
          style={{ width: 140, height: 40, borderWidth: 1, borderColor: colors.gray[300], borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: 14, color: colors.gray[900] }}
        />
      </View>
      <AppDataTable columns={columns} data={employees} emptyMessage="Aucun employe" />
    </SectionCard>
  );
}
