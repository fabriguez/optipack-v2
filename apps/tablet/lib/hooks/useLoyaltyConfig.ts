import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { loyaltyConfigApi, type LoyaltyConfigDTO } from '@/lib/api/loyaltyConfig';

const QK = ['system', 'loyalty-config'] as const;

export function useLoyaltyConfig() {
  return useQuery({
    queryKey: QK,
    queryFn: () => loyaltyConfigApi.get(),
    // Cache long : la config change rarement, on evite les requetes inutiles.
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpdateLoyaltyConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<LoyaltyConfigDTO>) => loyaltyConfigApi.update(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast.success('Politique de fidelite mise a jour');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Echec de la mise a jour'),
  });
}
