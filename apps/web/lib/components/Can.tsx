'use client';

import { ReactNode } from 'react';
import { usePermission } from '../hooks/usePermission';

interface CanProps {
  permission: string | string[];
  /** "any" (defaut) : OR ; "all" : AND */
  mode?: 'any' | 'all';
  children: ReactNode;
  fallback?: ReactNode;
}

/**
 * Composant declaratif pour proteger une zone d'UI selon les permissions ABAC.
 * <Can permission="attendance.justify"><Button>Justifier</Button></Can>
 */
export function Can({ permission, mode = 'any', children, fallback = null }: CanProps) {
  const allowed = usePermission(permission, mode);
  return <>{allowed ? children : fallback}</>;
}
