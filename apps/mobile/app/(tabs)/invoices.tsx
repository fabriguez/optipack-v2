import { useState } from 'react';
import { View, Text, FlatList, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { portalApi } from '@/lib/api/portal';
import { Badge } from '@/components/ui/Badge';
import { invoiceStatusLabel } from '@/lib/labels';
import { colors, radius, spacing } from '@/lib/theme/colors';
import { formatAmount } from '@transitsoftservices/shared';

export default function InvoicesTab() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ['portal', 'invoices'],
    queryFn: () => portalApi.invoices({ limit: 50 }),
  });

  const items = (data?.data ?? []) as any[];

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      {isLoading ? (
        <ActivityIndicator color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 80, gap: spacing.sm }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="document-text-outline" size={40} color={colors.gray[300]} />
              <Text style={{ fontSize: 13, color: colors.gray[500], marginTop: 8 }}>Aucune facture</Text>
            </View>
          }
          renderItem={({ item: i }) => {
            const total = Number(i.totalAmount ?? i.total ?? 0);
            const paid = Number(i.paidAmount ?? 0);
            const remaining = i.balance != null ? Number(i.balance) : Math.max(total - paid, 0);
            const status = i.status ?? (remaining <= 0 ? 'PAID' : 'UNPAID');
            return (
              <Pressable
                onPress={() => router.push(`/invoices/${i.id}` as never)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? colors.gray[50] : colors.white,
                  borderRadius: radius.lg,
                  padding: spacing.lg,
                  gap: 6,
                })}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>
                    Facture {i.reference ?? i.number ?? i.id.slice(0, 8)}
                  </Text>
                  <Badge variant={status === 'PAID' ? 'success' : status === 'OVERDUE' || status === 'CANCELLED' ? 'error' : 'warning'}>
                    {invoiceStatusLabel(status)}
                  </Badge>
                </View>
                <Text style={{ fontSize: 12, color: colors.gray[500] }}>{i.createdAt?.slice(0, 10)}</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 13, color: colors.gray[700] }}>Total {formatAmount(total)}</Text>
                  {remaining > 0 && (
                    <Text style={{ fontSize: 13, color: colors.error, fontWeight: '600' }}>À payer {formatAmount(remaining)}</Text>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
