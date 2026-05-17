'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ScanLine, Trash2, X, Check, AlertCircle, Clock } from 'lucide-react';
import { AppInput } from '@/components/ui/AppInput';
import { AppButton } from '@/components/ui/AppButton';
import { QRScannerDialog } from './QRScannerDialog';
import { scanSound } from '@/lib/utils/scanSound';
import { normalizeScannedTracking } from '@/lib/utils/scanNormalize';
import { toast } from 'sonner';

export type LiveScanResult = {
  ok: boolean;
  label?: string;
  reason?: string;
};

export interface LiveScanCollectorProps {
  /**
   * Appele a chaque scan/saisie. Doit faire la requete serveur et resoudre
   * avec { ok, label, reason }. Reject = erreur reseau, traite comme echec.
   */
  onScan: (code: string) => Promise<LiveScanResult>;
  /** TTL du cache anti-doublon en ms. Defaut: 2 minutes. */
  dedupeMs?: number;
  placeholder?: string;
  helperText?: string;
  cameraTitle?: string;
  /** Verrou metier (ex: magasin destination non choisi). Empeche tout scan. */
  disabled?: boolean;
  disabledReason?: string;
}

type HistoryEntry = {
  id: string;
  code: string;
  status: 'pending' | 'ok' | 'error' | 'duplicate';
  label?: string;
  reason?: string;
  at: number;
};

/**
 * Scan en mode "live" : chaque code declenche immediatement une requete
 * serveur, le scanner reste ouvert pour scanner en chaine. Un cache local
 * (TTL [[dedupeMs]]) empeche de relancer la meme requete pour un colis deja
 * traite recemment.
 */
export function LiveScanCollector({
  onScan,
  dedupeMs = 2 * 60 * 1000,
  placeholder = 'Scanner ou coller un tracking...',
  helperText,
  cameraTitle = 'Scanner les colis',
  disabled = false,
  disabledReason,
}: LiveScanCollectorProps) {
  const [input, setInput] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [busy, setBusy] = useState(false);

  // Refs vivants pour echapper aux closures perimees (cf. QRScannerDialog).
  const onScanRef = useRef(onScan);
  const disabledRef = useRef(disabled);
  const disabledReasonRef = useRef(disabledReason);
  const dedupeMsRef = useRef(dedupeMs);
  // Map<normalizedCode, lastAttemptAt>. Toute tentative (succes ou echec
  // metier) bloque les requetes suivantes pendant dedupeMs pour eviter le
  // spam reseau. Les doublons de transport (BarcodeDetector qui rejoue le
  // meme frame) sont egalement neutralises.
  const recentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    onScanRef.current = onScan;
    disabledRef.current = disabled;
    disabledReasonRef.current = disabledReason;
    dedupeMsRef.current = dedupeMs;
  });

  const submitScan = useCallback(async (raw: string) => {
    const code = normalizeScannedTracking(raw);
    if (!code) return;

    if (disabledRef.current) {
      scanSound.error();
      toast.error(disabledReasonRef.current || 'Scan desactive');
      return;
    }

    const now = Date.now();
    const last = recentRef.current.get(code);
    if (last && now - last < dedupeMsRef.current) {
      const remainingSec = Math.ceil((dedupeMsRef.current - (now - last)) / 1000);
      scanSound.warning();
      toast.info(`Deja traite (${remainingSec}s restantes) : ${code}`);
      setHistory((h) => [
        { id: `${code}-${now}`, code, status: 'duplicate' as const, at: now, reason: `Re-scan ignore (${remainingSec}s)` },
        ...h,
      ].slice(0, 50));
      return;
    }

    // Marque immediatement pour bloquer les rafales avant la reponse serveur.
    recentRef.current.set(code, now);

    const entryId = `${code}-${now}`;
    setHistory((h) => [
      { id: entryId, code, status: 'pending' as const, at: now },
      ...h,
    ].slice(0, 50));

    setBusy(true);
    try {
      const res = await onScanRef.current(code);
      if (res.ok) {
        scanSound.success();
        setHistory((h) => h.map((e) => e.id === entryId ? { ...e, status: 'ok', label: res.label } : e));
        setInput('');
      } else {
        scanSound.error();
        setHistory((h) => h.map((e) => e.id === entryId ? { ...e, status: 'error', reason: res.reason } : e));
        toast.error(res.reason || `Echec : ${code}`);
      }
    } catch (e: any) {
      scanSound.error();
      const reason = e?.response?.data?.message || e?.message || 'Erreur reseau';
      setHistory((h) => h.map((entry) => entry.id === entryId ? { ...entry, status: 'error', reason } : entry));
      toast.error(reason);
    } finally {
      setBusy(false);
    }
  }, []);

  const clearHistory = () => setHistory([]);
  const removeEntry = (id: string) => setHistory((h) => h.filter((e) => e.id !== id));

  // Codes deja "geres" (ok) -- exposes au scanner pour info visuelle.
  const displayedCodes = history.map((h) => {
    const tag = h.status === 'ok' ? 'OK' : h.status === 'error' ? 'KO' : h.status === 'duplicate' ? 'DUP' : '...';
    return `[${tag}] ${h.label || h.code}`;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 gap-2">
          <AppInput
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void submitScan(input);
              }
            }}
            disabled={disabled}
          />
          <AppButton variant="outline" type="button" onClick={() => setCameraOpen(true)} title="Scanner" disabled={disabled}>
            <Camera className="h-4 w-4" />
          </AppButton>
          <AppButton
            type="button"
            variant="outline"
            onClick={() => void submitScan(input)}
            disabled={!input.trim() || busy || disabled}
            loading={busy}
          >
            Envoyer
          </AppButton>
        </div>
      </div>

      {helperText && <p className="text-xs text-gray-500">{helperText}</p>}
      {disabled && disabledReason && (
        <p className="text-xs font-medium text-red-600">{disabledReason}</p>
      )}

      <div className="rounded-xl border border-gray-100 bg-gray-50">
        <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
            <ScanLine className="h-3.5 w-3.5" />
            {history.length} scan{history.length > 1 ? 's' : ''} (anti-doublon {Math.round(dedupeMs / 1000)}s)
          </span>
          {history.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline"
            >
              <Trash2 className="h-3 w-3" />
              Effacer historique
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="p-4 text-center text-xs text-gray-400">Aucun scan pour le moment.</div>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-64 overflow-auto">
            {history.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                <span className="flex min-w-0 items-center gap-2">
                  {e.status === 'ok' && <Check className="h-3.5 w-3.5 shrink-0 text-green-600" />}
                  {e.status === 'error' && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                  {e.status === 'duplicate' && <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                  {e.status === 'pending' && <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-primary-600" />}
                  <span className="truncate font-mono text-gray-700">{e.label || e.code}</span>
                  {e.reason && <span className="truncate text-[10px] text-gray-500">{e.reason}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => removeEntry(e.id)}
                  className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="Retirer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <QRScannerDialog
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetected={(decoded) => { void submitScan(decoded); }}
        closeOnDetect={false}
        title={cameraTitle}
        accumulatedCodes={displayedCodes}
        onClearAccumulated={clearHistory}
      />
    </div>
  );
}
