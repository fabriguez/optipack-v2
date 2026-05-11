'use client';

import { useEffect, useState } from 'react';

/**
 * Hook : retourne l'etat online/offline du navigateur. S'abonne aux events
 * online/offline et a une heartbeat optionnelle pour detecter les cas
 * "connecte au wifi mais sans internet reel".
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
