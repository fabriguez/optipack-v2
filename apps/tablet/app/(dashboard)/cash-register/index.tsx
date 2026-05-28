import { ScrollView, View, Text, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth/AuthContext';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { formatAmount } from '@transitsoftservices/shared';

export default function CashRegisterScreen() {
  const { user } = useAuth();
  const agencyId = user?.agencyIds?.[0];
  const { data, isLoading } = useQuery({
    queryKey: ['cash-register', agencyId],
    queryFn: () => apiClient.get(`/cash-registers/${agencyId}`).then((r) => r.data),
    enabled: !!agencyId,
  });
  const reg = data?.data;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ padding: spacing['2xl'] }}>
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Caisse</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Solde et mouvements</Text>
      </View>
      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} />
      ) : !reg ? (
        <Card>
          <Text style={{ fontSize: 14, color: colors.gray[500], textAlign: 'center', padding: 24 }}>
            Aucune caisse pour cette agence.
          </Text>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader title={`Caisse ${reg.agency?.name ?? ''}`} right={<Badge variant={reg.status === 'OPEN' ? 'success' : 'default'}>{reg.status}</Badge>} />
            <View style={{ padding: spacing.lg, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 32, fontWeight: '700', color: colors.gray[900] }}>{formatAmount(Number(reg.balance ?? 0))}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[500] }}>Solde courant</Text>
            </View>
          </Card>
          <View style={{ marginTop: spacing.lg }}>
            <Card>
              <CardHeader title="Derniers mouvements" />
              {(reg.movements ?? []).slice(0, 20).map((m: any) => (
                <View key={m.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '500', color: colors.gray[900] }}>{m.label ?? m.type}</Text>
                    <Text style={{ fontSize: 11, color: colors.gray[500] }}>{m.createdAt?.slice(0, 16)}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: m.amount >= 0 ? colors.primary[700] : colors.error }}>
                    {m.amount >= 0 ? '+' : ''}{formatAmount(Number(m.amount))}
                  </Text>
                </View>
              ))}
              {(!reg.movements || reg.movements.length === 0) && (
                <Text style={{ fontSize: 13, color: colors.gray[400], textAlign: 'center', padding: 16 }}>Aucun mouvement</Text>
              )}
            </Card>
          </View>
        </>
      )}
    </ScrollView>
  );
}
