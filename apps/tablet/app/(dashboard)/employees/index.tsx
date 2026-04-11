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
import { formatAmount } from '@optipack/shared';

export default function EmployeesScreen() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  const { data: agenciesData } = useQuery({
    queryKey: ['agencies-for-employees'],
    queryFn: () => apiClient.get('/agencies?limit=50').then((r) => r.data),
  });

  const agencies: any[] = agenciesData?.data ?? [];
  const agencyId = agencies[0]?.id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['employees', agencyId],
    queryFn: () => apiClient.get(`/employees/agency/${agencyId}`).then((r) => r.data),
    enabled: !!agencyId,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const employees: any[] = data?.data ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing['2xl'] }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}
    >
      <View style={{ marginBottom: spacing['2xl'] }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: colors.gray[900] }}>Personnel</Text>
        <Text style={{ fontSize: 14, color: colors.gray[500], marginTop: 4 }}>
          {agencyId ? `Employes de ${agencies[0]?.name ?? 'l\'agence'}` : 'Chargement des agences...'}
        </Text>
      </View>

      {isLoading || !agencyId ? (
        <ActivityIndicator size="large" color={colors.primary[500]} style={{ marginTop: 40 }} />
      ) : (
        <Card>
          <CardHeader title="Tous les employes" subtitle={`${employees.length} resultats`} />
          {employees.length === 0 ? (
            <Text style={{ textAlign: 'center', fontSize: 13, color: colors.gray[400], paddingVertical: 20 }}>Aucun employe trouve</Text>
          ) : (
            employees.map((employee, i) => (
              <Pressable
                key={employee.id}
                onPress={() => {}}
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderBottomWidth: i < employees.length - 1 ? 1 : 0,
                  borderBottomColor: '#F3F4F6',
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: colors.gray[900] }}>{employee.fullName}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
                    {employee.position && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="briefcase-outline" size={12} color={colors.gray[400]} />
                        <Text style={{ fontSize: 12, color: colors.gray[500] }}>{employee.position}</Text>
                      </View>
                    )}
                    {employee.phone && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="call-outline" size={12} color={colors.gray[400]} />
                        <Text style={{ fontSize: 12, color: colors.gray[500] }}>{employee.phone}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.gray[700] }}>
                    {formatAmount(Number(employee.baseSalary ?? 0))}
                  </Text>
                  <Badge variant={employee.isActive ? 'success' : 'error'}>
                    {employee.isActive ? 'Actif' : 'Inactif'}
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
