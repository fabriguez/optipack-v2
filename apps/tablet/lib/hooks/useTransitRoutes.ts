import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { transitRoutesApi } from '@/lib/api/transitRoutes';
import { toast } from '@/lib/toast';
import { extractApiError } from '@/lib/api/errorMessage';
import type { PaginationInput } from '@transitsoftservices/shared';

export const useTransitRoutes = (params?: Partial<PaginationInput> & { type?: string; isActive?: string }) =>
  useQuery({ queryKey: ['transit-routes', params], queryFn: () => transitRoutesApi.list(params) });

export const useTransitRoute = (id: string) =>
  useQuery({ queryKey: ['transit-routes', id], queryFn: () => transitRoutesApi.getById(id), enabled: !!id });

export function useDeleteTransitRoute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => transitRoutesApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['transit-routes'] }); toast.success('Route supprimee'); },
    onError: (e) => toast.error(extractApiError(e, 'Erreur')),
  });
}
