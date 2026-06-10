import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { formatAmount } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/data/PageHeader';
import { SectionCard } from '@/components/data/DetailCards';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const TIERS = [
  { k: 'STANDARD', min: 0, variant: 'default' as const }, { k: 'SILVER', min: 500, variant: 'info' as const },
  { k: 'GOLD', min: 2000, variant: 'warning' as const }, { k: 'VIP', min: 5000, variant: 'success' as const },
];

export default function LoyaltyScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { data, refetch } = useQuery({ queryKey: ['clients', { sortBy: 'loyaltyPoints', sortOrder: 'desc', limit: 50 }], queryFn: () => apiClient.get('/clients', { params: { limit: 50, sortBy: 'loyaltyPoints', sortOrder: 'desc' } }).then((r) => r.data) });
  const clients: any[] = data?.data ?? [];
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };
  const countByTier = (k: string) => clients.filter((c) => (c.loyaltyTier ?? 'STANDARD') === k).length;

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Programme de fidelite" subtitle="Classement des clients par points" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {TIERS.map((t) => (
            <Card key={t.k} style={{ flex: 1, minWidth: 150 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.gray[900] }}>{t.k}</Text>
                <Badge variant={t.variant}>{`${t.min}+ pts`}</Badge>
              </View>
              <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900], marginTop: 8 }}>{countByTier(t.k)}</Text>
              <Text style={{ fontSize: 12, color: colors.gray[400] }}>clients</Text>
            </Card>
          ))}
        </View>
        <SectionCard title="Classement clients" subtitle="Top clients par points de fidelite">
          {clients.map((c, i) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 10, borderBottomWidth: i < clients.length - 1 ? 1 : 0, borderBottomColor: colors.gray[50] }}>
              <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.primary[50], alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 13, fontWeight: '700', color: colors.primary[700] }}>{i + 1}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{c.fullName}</Text>
                {!!c.phone && <Text style={{ fontSize: 12, color: colors.gray[400] }}>{c.phone}</Text>}
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>{c.loyaltyPoints ?? 0} pts</Text>
                <Text style={{ fontSize: 11, color: colors.gray[400] }}>{formatAmount(Number(c.totalSpent ?? 0))}</Text>
              </View>
              <Badge variant={(TIERS.find((t) => t.k === (c.loyaltyTier ?? 'STANDARD'))?.variant) ?? 'default'}>{c.loyaltyTier ?? 'STANDARD'}</Badge>
            </View>
          ))}
        </SectionCard>
      </ScrollView>
    </View>
  );
}
