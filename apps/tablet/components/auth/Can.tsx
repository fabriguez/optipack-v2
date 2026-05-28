import type { ReactNode } from 'react';
import { usePermission } from '@/lib/hooks/usePermission';

interface CanProps {
  permission: string | string[];
  mode?: 'any' | 'all';
  fallback?: ReactNode;
  children: ReactNode;
}

export function Can({ permission, mode = 'any', fallback = null, children }: CanProps) {
  const allowed = usePermission(permission, mode);
  return <>{allowed ? children : fallback}</>;
}
