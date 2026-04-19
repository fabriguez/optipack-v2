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
import { formatAmount } from '@transitsoftservices/shared';

export default function InvoicesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['invoices'],
    queryFn: () => apiClient.get('/invoices?limit=50').then((r) => r.data),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const invoices: any[] = data?.data ?? [];

  const statusVariant = (status: string) => {
    if (status === 'PAID') return 'success';
    if (status === 'PARTIAL') return 'warning';
    if (status === 'UNPAID') return 'error';
    return 'default';
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Factures</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Gestion des factures</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <Card>
          <CardHeader title="Toutes les factures" subtitle={`${invoices.length} resultats`} />
          {invoices.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Aucune facture trouvee</Text>
          ) : (
            invoices.map((invoice, i) => (
              <Pressable
                key={invoice.id}
                onPress={() => {}}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: i < invoices.length - 1 ? 1 : 0,
                  borderBottomColor: '#F3F4F6',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', fontFamily: 'monospace', color: colors.gray[900] }}>
                    {invoice.reference}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Ionicons name="person-outline" size={12} color={colors.gray[400]} />
                    <Text style={{ fontSize: 12, color: colors.gray[500] }}>{invoice.client?.fullName ?? '-'}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: colors.gray[900] }}>
                      {formatAmount(Number(invoice.netAmount ?? 0))}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                      <Text style={{ fontSize: 11, color: colors.primary[600] }}>
                        Paye: {formatAmount(Number(invoice.paidAmount ?? 0))}
                      </Text>
                      <Text style={{ fontSize: 11, color: colors.error }}>
                        Solde: {formatAmount(Number(invoice.balance ?? 0))}
                      </Text>
                    </View>
                  </View>
                  <Badge variant={statusVariant(invoice.status)}>{invoice.status}</Badge>
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
