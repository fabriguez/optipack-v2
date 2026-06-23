'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface Me {
  id: string;
  email: string;
  fullName: string;
  isSuperAdmin: boolean;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  // Scope tenant : null pour un ops global. Non-null = compte facturation tenant.
  tenantId: string | null;
  tenant: { id: string; slug: string; name: string } | null;
}

/**
 * Identite du compte ops connecte. queryKey ['me'] partagee avec /me page.
 * `isTenantUser` = compte facturation scope a un tenant (vue restreinte).
 */
export function useMe() {
  const q = useQuery<Me>({
    queryKey: ['me'],
    queryFn: async () => (await api.get('/auth/me')).data?.data,
    staleTime: 60_000,
  });
  const me = q.data;
  return {
    me,
    isLoading: q.isLoading,
    isTenantUser: !!me?.tenantId,
    isSuperAdmin: !!me?.isSuperAdmin,
  };
}
