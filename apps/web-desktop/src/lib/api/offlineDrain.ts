'use client';

import { apiClient } from './client';
import { offlineQueue, type QueuedRequest } from './offlineQueue';
import { authLog } from './authDebug';

/**
 * Drain de la queue offline : rejoue FIFO chaque mutation. S'arrete au premier
 * echec reseau (pas la peine de saturer si on est encore offline). Les erreurs
 * 4xx/5xx (le serveur a refuse) entrainent la suppression de l'entree apres
 * MAX_ATTEMPTS pour eviter de bloquer la queue indefiniment.
 */
const MAX_ATTEMPTS = 5;

let draining = false;
let onDrainCompleteHandler: (() => void) | null = null;

export function setOnDrainComplete(handler: (() => void) | null) {
  onDrainCompleteHandler = handler;
}

export async function drainOfflineQueue(): Promise<{
  processed: number;
  remaining: number;
  errors: number;
}> {
  if (draining) {
    // Drain deja en cours : on rentre pas en concurrence.
    return { processed: 0, remaining: offlineQueue.count(), errors: 0 };
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, remaining: offlineQueue.count(), errors: 0 };
  }

  draining = true;
  let processed = 0;
  let errors = 0;
  try {
    while (true) {
      const list = offlineQueue.list();
      if (list.length === 0) break;
      const entry: QueuedRequest = list[0];
      authLog('offline.drain.replay', {
        id: entry.id,
        method: entry.method,
        url: entry.url,
        attempt: entry.attempts + 1,
      });
      try {
        // On marque `_queued` pour que l'intercepteur ne re-enqueue pas si
        // ca echoue a nouveau (sinon doublons en boucle).
        await apiClient.request({
          method: entry.method,
          url: entry.url,
          data: entry.data,
          params: entry.params,
          _queued: true,
        } as never);
        offlineQueue.remove(entry.id);
        processed += 1;
      } catch (e: any) {
        errors += 1;
        // Si toujours offline : on arrete (rien a gagner a continuer).
        const noResponse = !e?.response;
        offlineQueue.markFailure(entry.id, e?.message ?? 'unknown');
        if (noResponse) {
          authLog('offline.drain.stop-offline', { id: entry.id });
          break;
        }
        // Reponse serveur 4xx/5xx : on retire au-dela d'un seuil pour eviter
        // de bloquer la queue indefiniment sur une entree definitivement KO.
        const fresh = offlineQueue.list().find((x) => x.id === entry.id);
        if (fresh && fresh.attempts >= MAX_ATTEMPTS) {
          authLog('offline.drain.give-up', {
            id: entry.id,
            attempts: fresh.attempts,
            status: e?.response?.status,
          });
          offlineQueue.remove(entry.id);
        } else {
          // On laisse en place pour retry ulterieur (sync manuel ou prochain online).
          break;
        }
      }
    }
  } finally {
    draining = false;
    onDrainCompleteHandler?.();
  }
  return { processed, remaining: offlineQueue.count(), errors };
}

/**
 * Branche l'auto-drain au retour de connexion. Idempotent : appeler plusieurs
 * fois ne cree pas plusieurs listeners.
 */
let autoDrainBound = false;
export function bindAutoDrain() {
  if (typeof window === 'undefined' || autoDrainBound) return;
  autoDrainBound = true;
  window.addEventListener('online', () => {
    drainOfflineQueue().catch(() => {});
  });
  // Tentative initiale au chargement si la queue contient deja des entrees.
  if (offlineQueue.count() > 0 && navigator.onLine) {
    drainOfflineQueue().catch(() => {});
  }
}
