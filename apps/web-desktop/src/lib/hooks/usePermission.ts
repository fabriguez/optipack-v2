import { useMemo } from 'react';
import { useAuthStore } from '@/lib/auth/authStore';

/**
 * Hook ABAC (Phase 1 RH) : verifie si l'utilisateur courant possede une ou
 * plusieurs permissions. SUPER_ADMIN bypass (permissions=['*']).
 *
 * Les permissions sont decodees depuis le claim `permissions` du JWT
 * `accessToken` (signe par l'API). Cela evite de stocker une copie redondante
 * cote client.
 *
 * Usage :
 *   const canMark = usePermission('attendance.mark');
 *   const canMarkOrJustify = usePermission(['attendance.mark', 'attendance.justify']);
 */
export function usePermission(keys: string | string[], mode: 'any' | 'all' = 'any'): boolean {
  const perms = usePermissions();
  const role = useAuthStore((s) => s.user?.role);

  if (role === 'SUPER_ADMIN' || perms.includes('*')) return true;
  if (perms.length === 0) return false;

  const required = Array.isArray(keys) ? keys : [keys];
  if (required.length === 0) return true;
  return mode === 'all'
    ? required.every((k) => perms.includes(k))
    : required.some((k) => perms.includes(k));
}

/**
 * Indique si l'utilisateur courant est admin du tenant (ADMIN ou SUPER_ADMIN).
 * Utilise pour gater les surfaces dediees a l'administration tenant : Studio
 * site, configuration email/branding/mobile-app, etc. Pour des permissions
 * plus fines (RH, comptabilite), utiliser `usePermission`.
 */
export function useIsTenantAdmin(): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/** Retourne les agencyIds du user courant (vide = admin org-wide). */
export function useAgencyIds(): string[] {
  return useAuthStore((s) => s.user?.agencyIds ?? []);
}

/** Retourne la liste brute des permissions extraites du JWT API. */
export function usePermissions(): string[] {
  const accessToken = useAuthStore((s) => s.accessToken);
  return useMemo(() => decodePermissionsFromJwt(accessToken), [accessToken]);
}

function decodePermissionsFromJwt(token: string | null | undefined): string[] {
  if (!token) return [];
  try {
    const payload = token.split('.')[1];
    if (!payload) return [];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(json) as { permissions?: string[] };
    return obj.permissions ?? [];
  } catch {
    return [];
  }
}
