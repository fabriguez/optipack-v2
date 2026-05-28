import { useAuth } from '@/lib/auth/AuthContext';

/**
 * ABAC check. Mirror exact du hook web (apps/web/lib/hooks/usePermission.ts).
 * SUPER_ADMIN ou perms=['*'] bypass tout. mode='any' (defaut) / 'all'.
 */
export function usePermission(keys: string | string[], mode: 'any' | 'all' = 'any'): boolean {
  const { permissions, user } = useAuth();
  const role = user?.role;
  if (role === 'SUPER_ADMIN' || permissions.includes('*')) return true;
  if (permissions.length === 0) return false;
  const required = Array.isArray(keys) ? keys : [keys];
  if (required.length === 0) return true;
  return mode === 'all'
    ? required.every((k) => permissions.includes(k))
    : required.some((k) => permissions.includes(k));
}

export function useIsTenantAdmin(): boolean {
  const { user } = useAuth();
  const role = user?.role;
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

export function usePermissions(): string[] {
  return useAuth().permissions;
}
