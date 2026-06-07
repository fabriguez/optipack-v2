import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { formatAmount } from '@transitsoftservices/shared';

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === '') return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
      <Text style={{ fontSize: 13, color: colors.gray[500] }}>{label}</Text>
      <Text style={{ fontSize: 13, color: colors.gray[900], fontWeight: '500' }}>{String(value)}</Text>
    </View>
  );
}

export default function InvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoices', id],
    queryFn: () => apiClient.get(`/invoices/${id}`).then((r) => r.data),
    enabled: !!id,
  });
  const { refreshing, onRefresh } = usePullRefresh(refetch);
  const i = data?.data;

  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary[500]} /></View>;
  if (!i) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.gray[500] }}>Facture introuvable</Text></View>;

  const remaining = Number(i.total ?? 0) - Number(i.paidAmount ?? 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: 'transparent' }}
      contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.lg }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Pressable onPress={() => router.navigate('/invoices')} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color={colors.gray[700]} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>{i.number ?? i.id.slice(0, 8)}</Text>
          <Text style={{ fontSize: 13, color: colors.gray[500] }}>{i.client?.fullName ?? ''}</Text>
        </View>
        {i.status && <Badge variant={i.status === 'PAID' ? 'success' : i.status === 'OVERDUE' ? 'error' : 'warning'}>{i.status}</Badge>}
      </View>

      <Card>
        <CardHeader title="Montants" />
        <View style={{ padding: spacing.lg }}>
          <Row label="Total" value={formatAmount(Number(i.total ?? 0))} />
          <Row label="Paye" value={formatAmount(Number(i.paidAmount ?? 0))} />
          <Row label="Restant" value={formatAmount(remaining)} />
        </View>
      </Card>

      {i.items && i.items.length > 0 && (
        <Card>
          <CardHeader title="Lignes" subtitle={`${i.items.length} ligne(s)`} />
          <View style={{ padding: spacing.lg, gap: 8 }}>
            {i.items.map((it: any) => (
              <View key={it.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.gray[100] }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, color: colors.gray[900] }}>{it.label ?? it.designation ?? ''}</Text>
                  {it.quantity && <Text style={{ fontSize: 11, color: colors.gray[500] }}>Qte: {it.quantity}</Text>}
                </View>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>{formatAmount(Number(it.amount ?? it.total ?? 0))}</Text>
              </View>
            ))}
          </View>
        </Card>
      )}
    </ScrollView>
  );
}
