'use client';

import { useMemo } from 'react';
import { useSession } from 'next-auth/react';

/**
 * Hook ABAC (Phase 1 RH) : verifie si l'utilisateur courant possede une ou
 * plusieurs permissions. SUPER_ADMIN bypass (permissions=['*']).
 *
 * Les permissions sont decodees depuis le claim `permissions` du JWT
 * `accessToken` (signe par l'API). Cela evite de stocker une copie redondante
 * dans le cookie NextAuth -- crucial pour un admin avec 60+ permissions
 * (sinon le cookie peut depasser la limite navigateur de 4 kB et provoquer
 * des deconnexions surprise).
 *
 * Usage :
 *   const canMark = usePermission('attendance.mark');
 *   const canMarkOrJustify = usePermission(['attendance.mark', 'attendance.justify']);
 */
export function usePermission(keys: string | string[], mode: 'any' | 'all' = 'any'): boolean {
  const perms = usePermissions();
  const { data: session } = useSession();
  const role = (session as any)?.role as string | undefined;

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
  const { data: session } = useSession();
  const role = (session as any)?.role as string | undefined;
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/** Retourne les agencyIds du user courant (vide = admin org-wide ou non authentifie). */
export function useAgencyIds(): string[] {
  const { data: session } = useSession();
  return ((session as any)?.agencyIds as string[] | undefined) ?? [];
}

/** Retourne la liste brute des permissions extraites du JWT API. */
export function usePermissions(): string[] {
  const { data: session } = useSession();
  const accessToken = (session as any)?.accessToken as string | undefined;
  return useMemo(() => decodePermissionsFromJwt(accessToken), [accessToken]);
}

function decodePermissionsFromJwt(token: string | undefined): string[] {
  if (!token) return [];
  try {
    const payload = token.split('.')[1];
    if (!payload) return [];
    const json =
      typeof Buffer !== 'undefined'
        ? Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
        : atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const obj = JSON.parse(json) as { permissions?: string[] };
    return obj.permissions ?? [];
  } catch {
    return [];
  }
}
