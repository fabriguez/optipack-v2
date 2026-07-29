import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AssignPromoCodeInput,
  CreatePromoCodeInput,
  PaginationInput,
  UpdatePromoCodeInput,
} from '@transitsoftservices/shared';
import { promoCodesApi, type PromoCodeFilters } from '@/lib/api/promoCodes';
import { extractApiError } from '@/lib/api/errorMessage';

export function usePromoCodes(params?: PromoCodeFilters) {
  return useQuery({
    queryKey: ['promo-codes', params],
    queryFn: () => promoCodesApi.list(params),
  });
}

export function usePromoCode(id: string) {
  return useQuery({
    queryKey: ['promo-codes', id],
    queryFn: () => promoCodesApi.getById(id),
    enabled: !!id,
  });
}

export function useCreatePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreatePromoCodeInput) => promoCodesApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promo-codes'] });
      toast.success('Code promo cree');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la creation')),
  });
}

export function useUpdatePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePromoCodeInput }) =>
      promoCodesApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promo-codes'] });
      toast.success('Code promo mis a jour');
    },
    onError: (e) => toast.error(extractApiError(e, 'Erreur lors de la mise a jour')),
  });
}

export function useDeletePromoCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => promoCodesApi.delete(id),
    onSuccess: (res: { data?: { softDeleted?: boolean } }) => {
      qc.invalidateQueries({ queryKey: ['promo-codes'] });
      toast.success(
        res?.data?.softDeleted
          ? 'Code promo archive (il a deja ete utilise)'
          : 'Code promo supprime',
      );
    },
    onError: (e) => toast.error(extractApiError(e, 'Echec de la suppression')),
  });
}

export function usePromoCodeAssignments(
  id: string,
  params?: Partial<PaginationInput> & { search?: string },
) {
  return useQuery({
    queryKey: ['promo-codes', id, 'assignments', params],
    queryFn: () => promoCodesApi.listAssignments(id, params),
    enabled: !!id,
  });
}

export function useAssignPromoCode(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AssignPromoCodeInput) => promoCodesApi.assign(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promo-codes', id] });
      toast.success('Code attribue');
    },
    onError: (e) => toast.error(extractApiError(e, "Echec de l'attribution")),
  });
}

export function useUnassignPromoCode(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (clientId: string) => promoCodesApi.unassign(id, clientId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promo-codes', id] });
      toast.success('Attribution retiree');
    },
    onError: (e) => toast.error(extractApiError(e, 'Echec du retrait')),
  });
}

export function usePromoCodeRedemptions(id: string, params?: Partial<PaginationInput>) {
  return useQuery({
    queryKey: ['promo-codes', id, 'redemptions', params],
    queryFn: () => promoCodesApi.listRedemptions(id, params),
    enabled: !!id,
  });
}
