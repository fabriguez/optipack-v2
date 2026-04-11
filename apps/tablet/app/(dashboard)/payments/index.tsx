import { View, Text, ScrollView, RefreshControl, Pressable, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';
import { formatAmount, formatDate } from '@optipack/shared';

export default function PaymentsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['payments'],
    queryFn: () => apiClient.get('/payments?limit=50').then((r) => r.data),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const payments: any[] = data?.data ?? [];

  const methodVariant = (method: string) => {
    if (method === 'CASH') return 'success';
    if (method === 'MOBILE_MONEY') return 'info';
    if (method === 'BANK_TRANSFER') return 'warning';
    return 'default';
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Paiements</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Historique des paiements</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <Card>
          <CardHeader title="Tous les paiements" subtitle={`${payments.length} resultats`} />
          {payments.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Aucun paiement trouve</Text>
          ) : (
            payments.map((payment, i) => (
              <Pressable
                key={payment.id}
                onPress={() => {}}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: i < payments.length - 1 ? 1 : 0,
                  borderBottomColor: '#F3F4F6',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', fontFamily: 'monospace', color: colors.gray[900] }}>
                    {payment.reference}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="document-text-outline" size={12} color={colors.gray[400]} />
                      <Text style={{ fontSize: 12, color: colors.gray[500] }}>{payment.invoice?.reference ?? '-'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="business-outline" size={12} color={colors.gray[400]} />
                      <Text style={{ fontSize: 12, color: colors.gray[500] }}>{payment.agency?.name ?? '-'}</Text>
                    </View>
                  </View>
                  {payment.createdAt && (
                    <Text style={{ fontSize: 11, color: colors.gray[400], marginTop: 4 }}>
                      {formatDate(payment.createdAt)}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: colors.primary[700] }}>
                    {formatAmount(Number(payment.amount ?? 0))}
                  </Text>
                  <Badge variant={methodVariant(payment.paymentMethod)}>{payment.paymentMethod ?? '-'}</Badge>
                  {payment.isVoided && <Badge variant="error">Annule</Badge>}
                  <Ionicons name="chevron-forward" size={16} color={colors.gray[300]} />
                </View>
              </Pressable>
            ))
          )}
        </Card>
      )}
    </ScrollView>
  );
}
