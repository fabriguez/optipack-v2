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

export default function AgenciesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['agencies'],
    queryFn: () => apiClient.get('/agencies?limit=50').then((r) => r.data),
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const agencies: any[] = data?.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Agences</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>Gestion des agences</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <Card>
          <CardHeader title="Toutes les agences" subtitle={`${agencies.length} resultats`} />
          {agencies.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Aucune agence trouvee</Text>
          ) : (
            agencies.map((agency, i) => (
              <Pressable
                key={agency.id}
                onPress={() => {}}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: i < agencies.length - 1 ? 1 : 0,
                  borderBottomColor: '#F3F4F6',
                }}
              >
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', fontFamily: 'monospace', color: colors.primary[700] }}>
                      {agency.code}
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: colors.gray[900] }}>{agency.name}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Ionicons name="location-outline" size={12} color={colors.gray[400]} />
                      <Text style={{ fontSize: 12, color: colors.gray[500] }}>
                        {agency.city}{agency.country ? `, ${agency.country}` : ''}
                      </Text>
                    </View>
                    {agency.phone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="call-outline" size={12} color={colors.gray[400]} />
                        <Text style={{ fontSize: 12, color: colors.gray[500] }}>{agency.phone}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Badge variant={agency.isActive ? 'success' : 'error'}>
                    {agency.isActive ? 'Actif' : 'Inactif'}
                  </Badge>
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
