'use client';

import { useState } from 'react';
import { Shield } from 'lucide-react';
import { PageTransition } from '@/components/shared/PageTransition';
import { AppCard } from '@/components/ui/AppCard';
import { AppDataTable } from '@/components/ui/AppDataTable';
import { AppBadge } from '@/components/ui/AppBadge';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { formatDateTime } from '@optipack/shared';

const ACTION_COLORS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  CREATE: 'success',
  UPDATE: 'warning',
  DELETE: 'error',
  LOGIN: 'info',
  VOID: 'error',
  PAYMENT: 'success',
};

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', { page }],
    queryFn: () => apiClient.get('/audit', { params: { page, limit: 30 } }).then((r) => r.data).catch(() => ({ data: [], meta: { total: 0, page: 1, limit: 30, totalPages: 1 } })),
  });

  const columns = [
    { key: 'user', label: 'Utilisateur', render: (row: any) => row.user ? `${row.user.firstName} ${row.user.lastName}` : 'Systeme' },
    { key: 'action', label: 'Action', render: (row: any) => <AppBadge variant={ACTION_COLORS[row.action] || 'default'}>{row.action}</AppBadge> },
    { key: 'entityType', label: 'Entite' },
    { key: 'entityId', label: 'ID', render: (row: any) => row.entityId ? <span className="font-mono text-xs">{row.entityId.substring(0, 8)}...</span> : '-' },
    { key: 'ipAddress', label: 'IP', render: (row: any) => row.ipAddress || '-' },
    { key: 'createdAt', label: 'Date', render: (row: any) => formatDateTime(row.createdAt) },
  ];

  return (
    <PageTransition>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal d'audit</h1>
          <p className="text-sm text-gray-500 mt-1">Tracabilite complete de toutes les actions utilisateur.</p>
        </div>
        <AppCard padding="sm">
          <AppDataTable columns={columns} data={data?.data || []} isLoading={isLoading} page={page} totalPages={data?.meta?.totalPages || 1} total={data?.meta?.total} onPageChange={setPage} />
        </AppCard>
      </div>
    </PageTransition>
  );
}
