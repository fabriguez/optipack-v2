import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { formatAmount, formatDate } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SectionCard, InfoCard } from '@/components/data/DetailCards';
import { usePullRefresh } from '@/lib/hooks/usePullRefresh';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

function PRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.gray[50] }}>
      <Ionicons name={icon} size={16} color={colors.gray[400]} />
      <Text style={{ fontSize: 13, color: colors.gray[500], width: 140 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, color: colors.gray[900], fontWeight: '500', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

export default function PenaltyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pId = String(id);
  const router = useRouter();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['penalties', pId], queryFn: () => apiClient.get(`/penalties/${pId}`).then((r) => r.data), enabled: !!pId });
  const { refreshing, onRefresh } = usePullRefresh(refetch);

  const p = data?.data;
  if (isLoading) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={colors.primary[500]} /></View>;
  if (!p) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['3xl'] }}><Text style={{ color: colors.gray[500] }}>Penalite introuvable</Text></View>;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Pressable onPress={() => router.navigate('/penalties')} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.gray[100] : 'transparent' })}>
            <Ionicons name="arrow-back" size={22} color={colors.gray[600]} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={{ fontSize: 22, fontWeight: '700', color: colors.gray[900] }}>Penalite</Text>
              <Badge variant={p.isPaid ? 'success' : 'error'}>{p.isPaid ? 'Payee' : 'Non payee'}</Badge>
            </View>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 2 }}>Depuis le {p.startDate ? formatDate(p.startDate) : '-'}</Text>
          </View>
        </View>

        <Card>
          <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
            <Text style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: colors.gray[400] }}>Montant total de la penalite</Text>
            <Text style={{ fontSize: 30, fontWeight: '700', color: colors.error, marginTop: 6 }}>{formatAmount(Number(p.totalAmount ?? 0))}</Text>
            <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 4 }}>{p.daysAccumulated ?? 0} jour(s) x {formatAmount(Number(p.dailyRate ?? 0))}/jour</Text>
          </View>
        </Card>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          <InfoCard icon="cube-outline" label="Colis" value={p.parcel?.trackingNumber ?? '-'} />
          <InfoCard icon="person-outline" label="Client" value={p.client?.fullName ?? '-'} />
          <InfoCard icon="business-outline" label="Agence" value={p.agency?.name ?? '-'} />
        </View>

        <SectionCard title="Details">
          <PRow icon="calendar-outline" label="Date de debut" value={p.startDate ? formatDate(p.startDate) : '-'} />
          <PRow icon="card-outline" label="Taux journalier" value={formatAmount(Number(p.dailyRate ?? 0))} />
          <PRow icon="time-outline" label="Jours accumules" value={`${p.daysAccumulated ?? 0} jour(s)`} />
          <PRow icon="alert-circle-outline" label="Montant total" value={formatAmount(Number(p.totalAmount ?? 0))} />
        </SectionCard>
      </ScrollView>
    </View>
  );
}
