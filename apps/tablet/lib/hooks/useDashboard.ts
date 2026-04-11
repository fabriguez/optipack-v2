import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => apiClient.get('/dashboard/stats').then((r) => r.data),
    refetchInterval: 30000,
  });
}
