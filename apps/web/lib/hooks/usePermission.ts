'use client';

import { useSession } from 'next-auth/react';

/**
 * Hook ABAC (Phase 1 RH) : verifie si l'utilisateur courant possede une ou
 * plusieurs permissions. SUPER_ADMIN bypass (permissions=['*']).
 *
 * Usage :
 *   const canMark = usePermission('attendance.mark');
 *   const canMarkOrJustify = usePermission(['attendance.mark', 'attendance.justify']);
 *
 * Pour proteger un bouton :
 *   {canMark && <Button onClick={...}>Pointer</Button>}
 *
 * Pour proteger un bloc avec UI fallback : voir <Can> ci-dessous.
 */
export function usePermission(keys: string | string[], mode: 'any' | 'all' = 'any'): boolean {
  const { data: session } = useSession();
  const perms = (session as any)?.permissions as string[] | undefined;
  const role = (session as any)?.role as string | undefined;

  if (!perms) return false;
  if (role === 'SUPER_ADMIN' || perms.includes('*')) return true;

  const required = Array.isArray(keys) ? keys : [keys];
  if (required.length === 0) return true;
  return mode === 'all'
    ? required.every((k) => perms.includes(k))
    : required.some((k) => perms.includes(k));
}

/** Retourne la liste brute des permissions de la session (vide si non connecte). */
export function usePermissions(): string[] {
  const { data: session } = useSession();
  return ((session as any)?.permissions as string[] | undefined) ?? [];
}
