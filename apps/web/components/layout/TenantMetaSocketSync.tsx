'use client';

import { useEffect } from 'react';
import { useSocket } from '@/lib/providers/SocketProvider';

/**
 * Pont socket -> TenantProvider.
 *
 * TenantProvider est monte au niveau du root layout (avant l'auth, donc avant
 * SocketProvider qui vit dans (dashboard)/layout). Pour eviter une dependance
 * circulaire au niveau des providers, on utilise un CustomEvent fenetre
 * `tenant:meta:updated` declenche ici a chaque broadcast socket. Le provider
 * l'ecoute et refetch /tenant-meta pour re-appliquer skin + couleurs +
 * modules en direct sans reload.
 *
 * A monter sous SocketProvider (et donc dans (dashboard)/layout).
 */
export function TenantMetaSocketSync() {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket) return;
    const handler = (data: unknown) => {
      window.dispatchEvent(new CustomEvent('tenant:meta:updated', { detail: data }));
    };
    socket.on('tenant:meta:updated', handler);
    return () => {
      socket.off('tenant:meta:updated', handler);
    };
  }, [socket]);

  return null;
}
