'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, Cloud, RefreshCw, Trash2, ChevronDown } from 'lucide-react';
import { offlineQueue, type QueuedRequest } from '@/lib/api/offlineQueue';
import { drainOfflineQueue, bindAutoDrain, setOnDrainComplete } from '@/lib/api/offlineDrain';
import { useOnlineStatus } from '@/lib/hooks/useOnlineStatus';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AppButton } from '@/components/ui/AppButton';
import { toast } from 'sonner';

/**
 * Badge en haut a droite indiquant l'etat reseau + le nombre de mutations
 * en attente. Si online + queue vide, on n'affiche RIEN (pas de bruit visuel).
 *
 * Trois etats visibles :
 *   - Offline (peu importe la queue)            : badge rouge "Hors ligne"
 *   - Online + queue non vide                   : badge ambre "N en attente"
 *   - Drain en cours                            : badge primaire animation
 */
export function OfflineIndicator() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [entries, setEntries] = useState<QueuedRequest[]>([]);
  const [draining, setDraining] = useState(false);
  const qc = useQueryClient();

  // Setup au montage : bind l'auto-drain et abonne aux changements de queue.
  useEffect(() => {
    bindAutoDrain();
    // Quand un drain se termine, invalide toutes les queries pour rafraichir
    // l'UI avec les donnees serveur fraichement synchronisees.
    setOnDrainComplete(() => {
      qc.invalidateQueries();
    });
    const unsub = offlineQueue.subscribe(({ pending: p, entries: e }) => {
      setPending(p);
      setEntries(e);
    });
    return () => {
      unsub();
      setOnDrainComplete(null);
    };
  }, [qc]);

  const onSync = async () => {
    if (!online) {
      toast.error('Toujours hors ligne, la synchronisation ne peut pas demarrer.');
      return;
    }
    setDraining(true);
    try {
      const res = await drainOfflineQueue();
      if (res.processed > 0) {
        toast.success(`${res.processed} action(s) synchronisee(s)`);
      }
      if (res.remaining > 0) {
        toast.warning(`${res.remaining} action(s) en attente${res.errors > 0 ? ` (${res.errors} echec)` : ''}`);
      }
    } finally {
      setDraining(false);
    }
  };

  const onClear = () => {
    if (pending === 0) return;
    if (!confirm(`Abandonner ${pending} action(s) en attente ? Les changements seront perdus.`)) return;
    offlineQueue.clear();
    toast.info('File hors-ligne videe');
  };

  // Rien a afficher : online + queue vide.
  if (online && pending === 0) return null;

  const color = !online
    ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <Popover>
      <PopoverTrigger
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${color}`}
        title={!online ? 'Mode hors ligne' : 'Synchronisation en attente'}
      >
        {!online ? <CloudOff className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
        <span>
          {!online ? 'Hors ligne' : 'En attente'}
          {pending > 0 && <span className="ml-1 font-bold">({pending})</span>}
        </span>
        <ChevronDown className="h-3 w-3" />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80 p-3">
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {!online ? 'Mode hors ligne actif' : 'File de synchronisation'}
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              {!online
                ? 'Vos actions seront automatiquement renvoyees au retour de la connexion.'
                : 'Cliquez sur Synchroniser pour rejouer manuellement les actions en attente.'}
            </p>
          </div>

          {pending > 0 && (
            <div className="max-h-48 overflow-auto rounded-lg border border-gray-100 bg-gray-50">
              <ul className="divide-y divide-gray-100 text-[11px] font-mono">
                {entries.slice(0, 20).map((e) => (
                  <li key={e.id} className="px-2 py-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-800">{e.method}</span>
                      <span className="text-gray-400">{new Date(e.ts).toLocaleTimeString()}</span>
                    </div>
                    <div className="truncate text-gray-600">{e.url}</div>
                    {e.attempts > 0 && (
                      <div className="text-amber-700">
                        {e.attempts} essai(s){e.lastError ? ` : ${e.lastError.slice(0, 40)}` : ''}
                      </div>
                    )}
                  </li>
                ))}
                {entries.length > 20 && (
                  <li className="px-2 py-1 text-center text-gray-400">
                    + {entries.length - 20} autres...
                  </li>
                )}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            {pending > 0 && (
              <AppButton variant="ghost" size="sm" onClick={onClear} className="text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
                Abandonner
              </AppButton>
            )}
            <AppButton
              size="sm"
              onClick={onSync}
              loading={draining}
              disabled={!online || pending === 0}
              className="ml-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Synchroniser
            </AppButton>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
