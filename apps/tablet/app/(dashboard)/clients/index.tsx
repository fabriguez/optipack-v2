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

export default function ClientsScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.get('/clients?limit=50').then((r) => r.data),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const clients: any[] = data?.data ?? [];

  const tierVariant = (tier: string) => {
    if (tier === 'GOLD') return 'warning';
    if (tier === 'PLATINUM' || tier === 'VIP') return 'info';
    if (tier === 'SILVER') return 'default';
    return 'default';
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Clients</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Gestion des clients</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <Card>
          <CardHeader title="Tous les clients" subtitle={`${clients.length} resultats`} />
          {clients.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Aucun client trouve</Text>
          ) : (
            clients.map((client, i) => (
              <Pressable
                key={client.id}
                onPress={() => {}}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: i < clients.length - 1 ? 1 : 0,
                  borderBottomColor: '#F3F4F6',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{client.fullName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    {client.phone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="call-outline" size={12} color={colors.gray[400]} />
                        <Text style={{ fontSize: 12, color: colors.gray[500] }}>{client.phone}</Text>
                      </View>
                    )}
                    {client.email && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="mail-outline" size={12} color={colors.gray[400]} />
                        <Text style={{ fontSize: 12, color: colors.gray[500] }}>{client.email}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[900] }}>
                      {formatAmount(Number(client.totalSpent ?? 0))}
                    </Text>
                    <Text style={{ fontSize: 11, color: colors.gray[400], marginTop: 2 }}>
                      {client.loyaltyPoints ?? 0} pts
                    </Text>
                  </View>
                  {client.loyaltyTier && <Badge variant={tierVariant(client.loyaltyTier)}>{client.loyaltyTier}</Badge>}
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
