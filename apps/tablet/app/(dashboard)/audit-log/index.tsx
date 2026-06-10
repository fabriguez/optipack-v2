import { useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { formatDateTime } from '@transitsoftservices/shared';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/data/PageHeader';
import { AppDataTable, type Column } from '@/components/data/AppDataTable';
import { useServerPagination } from '@/lib/hooks/useServerPagination';
import { apiClient } from '@/lib/api/client';
import { colors } from '@/lib/theme/colors';
import { spacing } from '@/lib/theme/spacing';

const ACTION_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = { CREATE: 'success', UPDATE: 'warning', DELETE: 'error', LOGIN: 'info', VOID: 'error', PAYMENT: 'success' };

export default function AuditLogScreen() {
  const { page, limit, setPage, queryParams } = useServerPagination(30);
  const [refreshing, setRefreshing] = useState(false);
  const { data, isLoading, refetch } = useQuery({ queryKey: ['audit', queryParams], queryFn: () => apiClient.get('/audit', { params: { page: queryParams.page, limit: queryParams.limit } }).then((r) => r.data) });
  const rows: any[] = data?.data ?? [];
  const meta = data?.meta;
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  const columns: Column<any>[] = [
    { key: 'user', label: 'Utilisateur', width: 180, render: (r) => <Text style={{ fontSize: 13 }}>{r.user ? `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() : 'Systeme'}</Text> },
    { key: 'action', label: 'Action', width: 130, render: (r) => <Badge variant={ACTION_VARIANT[r.action] ?? 'default'}>{r.action}</Badge> },
    { key: 'entityType', label: 'Entite', width: 140 },
    { key: 'entityId', label: 'ID', width: 120, render: (r) => <Text style={{ fontFamily: 'monospace', fontSize: 11, color: colors.gray[400] }}>{r.entityId ? `${String(r.entityId).slice(0, 8)}...` : '-'}</Text> },
    { key: 'ipAddress', label: 'IP', width: 130, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.ipAddress ?? '-'}</Text> },
    { key: 'createdAt', label: 'Date', width: 160, render: (r) => <Text style={{ fontSize: 12, color: colors.gray[500] }}>{r.createdAt ? formatDateTime(r.createdAt) : '-'}</Text> },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing['2xl'], gap: spacing.xl }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[500]} />}>
        <PageHeader title="Journal d'audit" subtitle="Tracabilite de toutes les actions" />
        <Card padding="sm">
          <AppDataTable columns={columns} data={rows} isLoading={isLoading} page={page} totalPages={meta?.totalPages ?? 1} total={meta?.total} limit={limit} onPageChange={setPage} emptyMessage="Aucune entree" />
        </Card>
      </ScrollView>
    </View>
  );
}
