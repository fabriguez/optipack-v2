/**
 * Queue persistante de mutations API a rejouer quand la connexion revient.
 *
 * Strategie :
 *  - Stockage localStorage (simple, synchrone, suffit pour les payloads JSON).
 *  - FIFO : on rejoue dans l'ordre d'origine (l'ordre metier peut compter :
 *    creation d'un parent avant un enfant, etc.).
 *  - Pas d'uploads (FormData/Blob) : trop gros pour localStorage et
 *    risque de degradation silencieuse. Les uploads echouent visiblement.
 *  - Idempotence : on stocke l'id local genere a la mise en queue pour
 *    detecter et eviter les doublons sur drains concurrents.
 *
 * Le module n'a pas d'effets de bord au chargement (pas d'auto-drain ici) :
 * c'est le client API qui orchestrera l'ecoute du retour reseau.
 */

const STORAGE_KEY = 'apiOfflineQueue.v1';
const MAX_ENTRIES = 200;

export type QueueableMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface QueuedRequest {
  id: string;                // uuid local pour deduplication
  ts: number;                // queued at
  method: QueueableMethod;
  url: string;               // chemin relatif (apres baseURL)
  data?: unknown;
  params?: Record<string, unknown>;
  /** Tentatives deja effectuees (pour backoff / abandon eventuel). */
  attempts: number;
  /** Derniere erreur connue (pour debug). */
  lastError?: string;
}

type Listener = (state: { pending: number; entries: QueuedRequest[] }) => void;
const listeners = new Set<Listener>();

function readRaw(): QueuedRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeRaw(list: QueuedRequest[]): void {
  if (typeof window === 'undefined') return;
  try {
    // Garde-fou de taille pour eviter de saturer localStorage.
    const capped = list.slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // Quota depasse ou mode prive : on ignore silencieusement.
  }
  emit();
}

function emit() {
  const entries = readRaw();
  listeners.forEach((l) => l({ pending: entries.length, entries }));
}

export const offlineQueue = {
  list(): QueuedRequest[] {
    return readRaw();
  },

  count(): number {
    return readRaw().length;
  },

  /** Met en queue une mutation. Retourne l'entree creee. */
  enqueue(input: Omit<QueuedRequest, 'id' | 'ts' | 'attempts'>): QueuedRequest {
    const entry: QueuedRequest = {
      id: `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      ts: Date.now(),
      attempts: 0,
      ...input,
    };
    const list = readRaw();
    list.push(entry);
    writeRaw(list);
    return entry;
  },

  /** Marque la 1ere entree avec un echec (pour backoff). */
  markFailure(id: string, error: string): void {
    const list = readRaw();
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return;
    list[idx] = { ...list[idx], attempts: list[idx].attempts + 1, lastError: error };
    writeRaw(list);
  },

  /** Retire une entree (sur replay reussi ou suppression manuelle). */
  remove(id: string): void {
    const list = readRaw().filter((e) => e.id !== id);
    writeRaw(list);
  },

  /** Vide tout (utile pour bouton "abandonner"). */
  clear(): void {
    writeRaw([]);
  },

  /** Abonnement aux changements (pour l'indicateur UI). */
  subscribe(l: Listener): () => void {
    listeners.add(l);
    // Notifie immediatement l'etat courant.
    l({ pending: readRaw().length, entries: readRaw() });
    return () => listeners.delete(l);
  },
};

export function isQueueableMethod(method?: string): method is QueueableMethod {
  if (!method) return false;
  return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

/**
 * Heuristique pour decider si une erreur axios merite d'etre mise en queue.
 * On veut : pas de reponse serveur (vrai offline / dns / timeout). PAS les 4xx/5xx
 * (le serveur a refuse pour une raison metier ; rejouer n'aidera pas).
 */
export function shouldQueueOnError(err: { response?: unknown; code?: string }): boolean {
  // Pas de response = pas de retour serveur = probablement offline.
  if (err.response) return false;
  // Codes typiques axios pour les erreurs reseau.
  const code = err.code ?? '';
  return code === 'ERR_NETWORK' || code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === '';
}

/** Erreur jetee quand on a queue une mutation pour replay differe. */
export class OfflineQueuedError extends Error {
  readonly isOfflineQueued = true;
  constructor(public readonly entry: QueuedRequest) {
    super('Action ajoutee a la file d\'attente hors ligne');
    this.name = 'OfflineQueuedError';
  }
}
