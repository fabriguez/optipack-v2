'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw, RotateCw, Keyboard, Bug, Trash2 } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { scanLog, readScanLog, clearScanLog, type ScanDebugEntry } from '@/lib/api/scanDebug';

// Longueur minimale d'une lecture valide. Filtre les faux positifs frequents
// du BarcodeDetector qui retourne parfois des chaines tres courtes (1-3 chars)
// glanees sur des elements graphiques.
const MIN_VALID_LENGTH = 4;

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onDetected: (decoded: string) => void;
  title?: string;
  closeOnDetect?: boolean;
}

/**
 * Scanner QR + codes-barres avec lifecycle robuste.
 *
 * Strategie a 2 niveaux :
 *  1. BarcodeDetector natif (Chrome / Edge / Android) : fluide, sans dependance.
 *  2. Fallback html5-qrcode (Safari, Firefox, vieux navigateurs).
 *
 * Lifecycle critique :
 *  - aliveRef garde toute mutation d'etat dans la session courante du dialog.
 *    Si l'utilisateur ferme avant que getUserMedia / inst.start aient repondu,
 *    on ignore le resultat tardif au lieu de setState sur un dialog ferme
 *    (cause majeure des "crashes au close").
 *  - stopAll() est idempotent et awaitable, ce qui evite les races
 *    html5-qrcode (inst.start en vol vs cleanup synchrone).
 */
export function QRScannerDialog({
  open,
  onClose,
  onDetected,
  title = 'Scanner (QR / code-barres)',
  closeOnDetect = true,
}: QRScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackHostRef = useRef<HTMLDivElement | null>(null);
  const html5QrRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  // Marqueur "session courante du dialog". Bascule a false sur cleanup ;
  // on consulte aliveRef.current avant tout setState async.
  const aliveRef = useRef(false);
  // Empeche un double cleanup concurrent.
  const stoppingRef = useRef<Promise<void> | null>(null);
  const detectedOnceRef = useRef(false);

  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [manualValue, setManualValue] = useState('');
  // Panneau diagnostic embarque (utile sur mobile sans DevTools).
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<ScanDebugEntry[]>([]);

  // Helpers setState safes (ignorent si dialog ferme entre-temps).
  const safe = {
    setError: (v: string | null) => aliveRef.current && setError(v),
    setRunning: (v: boolean) => aliveRef.current && setRunning(v),
    setUsingFallback: (v: boolean) => aliveRef.current && setUsingFallback(v),
  };

  /** Arret idempotent et attendu de toutes les ressources camera. */
  const stopAll = (): Promise<void> => {
    if (stoppingRef.current) return stoppingRef.current;
    stoppingRef.current = (async () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Stop stream getUserMedia.
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        streamRef.current = null;
      }
      // Detache <video>.
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = null;
        } catch {
          // ignore
        }
      }
      // Stop html5-qrcode (await pour eviter les races).
      const inst = html5QrRef.current;
      html5QrRef.current = null;
      if (inst) {
        try {
          await inst.stop();
        } catch {
          // ignore : peut throw si jamais demarre / deja stoppe
        }
        try {
          inst.clear();
        } catch {
          // ignore
        }
      }
    })();
    return stoppingRef.current;
  };

  const handleDetected = (text: string) => {
    if (!aliveRef.current) {
      scanLog('detect.ignored.not-alive', { text });
      return;
    }
    if (detectedOnceRef.current) {
      scanLog('detect.ignored.already-detected', { text });
      return;
    }
    if (!text) {
      scanLog('detect.ignored.empty');
      return;
    }
    // Filtre les faux positifs : codes trop courts ou contenant des caracteres
    // de controle non imprimables. On a vu BarcodeDetector retourner des
    // bribes de 1-2 caracteres sur des logos / pixels parasites, ce qui fermait
    // le dialog instantanement (closeOnDetect=true) et donnait l'impression
    // que la camera se coupait apres 1s.
    const cleaned = text.trim();
    if (cleaned.length < MIN_VALID_LENGTH) {
      scanLog('detect.ignored.too-short', { text: cleaned, len: cleaned.length });
      return;
    }
    // Refuse les codes contenant uniquement des caracteres ASCII de controle
    // ou non imprimables (probable bruit du detecteur).
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x1f\x7f]+$/.test(cleaned)) {
      scanLog('detect.ignored.control-chars', { sample: cleaned.slice(0, 20) });
      return;
    }
    scanLog('detect.accepted', { text: cleaned, mode: usingFallback ? 'fallback' : 'native' });
    detectedOnceRef.current = true;
    onDetected(cleaned);
    if (closeOnDetect) {
      // On laisse le useEffect cleanup faire stopAll proprement.
      onClose();
    } else {
      setTimeout(() => {
        detectedOnceRef.current = false;
      }, 1500);
    }
  };

  useEffect(() => {
    if (!open) return;

    aliveRef.current = true;
    stoppingRef.current = null;
    detectedOnceRef.current = false;
    safe.setError(null);
    safe.setRunning(false);
    safe.setUsingFallback(false);
    scanLog('open', { facing, hasBarcodeDetector: typeof (window as any).BarcodeDetector === 'function' });

    const start = async () => {
      try {
        const BarcodeDetector = (window as any).BarcodeDetector;
        const hasNative = BarcodeDetector && typeof BarcodeDetector === 'function';

        // Si on sait deja qu'on n'a pas BarcodeDetector (Safari iOS), on saute
        // notre getUserMedia et on laisse html5-qrcode appeler le sien
        // directement. iOS rejette le 2e appel rapide de getUserMedia (NotReadableError
        // ou throw silencieux), ce qui faisait echouer inst.start.
        if (!hasNative) {
          scanLog('mode.fallback');
          await runFallback();
          return;
        }

        scanLog('getUserMedia.request', { facing });
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        scanLog('getUserMedia.ok');
        if (!aliveRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        if (!videoRef.current) {
          // Safari : le portal peut ne pas avoir mis le <video> dans le DOM.
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!aliveRef.current) return;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          if (!aliveRef.current) return;
          safe.setRunning(true);
        }

        scanLog('mode.native');
        await runNative();
      } catch (e: any) {
        if (!aliveRef.current) {
          scanLog('start.error.but-not-alive', { name: e?.name, msg: e?.message });
          return;
        }
        const msg =
          e?.name === 'NotAllowedError'
            ? 'Acces camera refuse. Autorisez la camera dans les parametres.'
            : e?.name === 'NotFoundError'
              ? 'Aucune camera detectee.'
              : e?.name === 'NotReadableError'
                ? 'Camera deja utilisee par une autre application.'
                : e?.message || 'Impossible de demarrer la camera.';
        scanLog('start.error', { name: e?.name, msg });
        safe.setError(msg);
        safe.setRunning(false);
      }
    };

    const runNative = async () => {
      const BarcodeDetector = (window as any).BarcodeDetector;
      let formats: string[] = ['qr_code'];
      try {
        const supported: string[] = await BarcodeDetector.getSupportedFormats();
        if (supported && supported.length) formats = supported;
      } catch {
        // ignore
      }
      let detector: any;
      try {
        detector = new BarcodeDetector({ formats });
      } catch {
        // BarcodeDetector existe mais l'instanciation echoue (Safari Mac sans
        // support reel) -> bascule sur le fallback html5-qrcode.
        await runFallback();
        return;
      }

      const tick = async () => {
        if (!aliveRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length) {
            const value = codes[0].rawValue || codes[0].value;
            if (value) handleDetected(String(value));
          }
        } catch {
          // ignore frame error
        }
        if (aliveRef.current) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const runFallback = async () => {
      safe.setUsingFallback(true);
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (!aliveRef.current || !fallbackHostRef.current) return;
        // iOS Safari : html5-qrcode attache un <video> au host. Si le host est
        // encore display:none (avant commit React), inst.start() peut ne jamais
        // resoudre. On attend deux rAF pour garantir que le DOM est layoute.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (!aliveRef.current || !fallbackHostRef.current) return;

        const hostId = `qr-fallback-host-${Math.random().toString(36).slice(2, 8)}`;
        fallbackHostRef.current.id = hostId;

        const formats = [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.AZTEC,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.PDF_417,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
        ];

        const inst = new Html5Qrcode(hostId, {
          verbose: false,
          formatsToSupport: formats,
        });
        // Si fermeture pendant l'instanciation, on n'enregistre pas inst et on
        // disposera ce qu'on peut juste apres.
        if (!aliveRef.current) {
          try {
            inst.clear();
          } catch {
            // ignore
          }
          return;
        }
        html5QrRef.current = inst;

        // Coupe notre stream getUserMedia : html5-qrcode va prendre la main.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;

        scanLog('html5qr.start.before', { hostId, facing });
        await inst.start(
          // html5-qrcode n'accepte que { exact } ou une string pour facingMode,
          // pas { ideal }. On utilise la string : si la camera demandee n'existe
          // pas, html5-qrcode bascule sur la camera disponible (vs { exact } qui
          // throw OverconstrainedError).
          { facingMode: facing } as MediaTrackConstraints,
          {
            fps: 15,
            qrbox: (vw: number, vh: number) => {
              const min = Math.min(vw, vh);
              return { width: Math.floor(min * 0.8), height: Math.floor(min * 0.5) };
            },
          },
          (decodedText: string) => handleDetected(decodedText),
          () => {},
        );
        scanLog('html5qr.start.after');
        // Si fermeture s'est produite pendant inst.start, on stoppe immediatement.
        if (!aliveRef.current) {
          try {
            await inst.stop();
          } catch {
            // ignore
          }
          try {
            inst.clear();
          } catch {
            // ignore
          }
          html5QrRef.current = null;
          return;
        }
        safe.setRunning(true);
      } catch (e: any) {
        // iOS Safari peut throw des objets non-Error (string, plain object) ;
        // on capture tout ce qu'on peut pour le diagnostic.
        let serialized: any = {};
        try {
          serialized = {
            type: typeof e,
            ctor: e?.constructor?.name,
            name: e?.name,
            msg: e?.message,
            str: typeof e === 'string' ? e : undefined,
            asString: (() => {
              try {
                return String(e);
              } catch {
                return '<no-string>';
              }
            })(),
            keys: e && typeof e === 'object' ? Object.keys(e).slice(0, 10) : [],
            json: (() => {
              try {
                return JSON.stringify(e);
              } catch {
                return '<no-json>';
              }
            })(),
          };
        } catch {
          // ignore
        }
        scanLog('html5qr.start.error', serialized);
        if (!aliveRef.current) return;
        const userMsg = e?.message || (typeof e === 'string' ? e : null) || 'Impossible de demarrer le scanner.';
        safe.setError(userMsg);
        safe.setRunning(false);
      }
    };

    void start();

    return () => {
      scanLog('cleanup', { reason: 'effect-cleanup' });
      aliveRef.current = false;
      // On lance stopAll mais on ne retarde pas le cleanup React (Promise ignoree).
      // L'idempotence + stoppingRef garantit que les appels concurrents sont fusionnes.
      void stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facing]);

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <AppButton variant="ghost" onClick={onClose}>
          Fermer
        </AppButton>
      }
    >
      <div className="space-y-3">
        {error ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-red-100 bg-red-50 p-6 text-center">
            <CameraOff className="h-8 w-8 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
            <AppButton
              size="sm"
              variant="outline"
              onClick={() => {
                setError(null);
                setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reessayer
            </AppButton>
          </div>
        ) : (
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <Camera className="h-3.5 w-3.5" />
            Placez le QR ou le code-barres dans le cadre.
          </p>
        )}

        {/* Video natif (BarcodeDetector). Cache si fallback html5-qrcode actif. */}
        <div
          className="relative overflow-hidden rounded-xl bg-black/95"
          style={{ minHeight: 280 }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-auto w-full"
            style={{
              minHeight: 280,
              // iOS Safari : on evite display:none (qui peut casser getUserMedia
              // attache) en utilisant visibility/opacity. Le host fallback reste
              // toujours dans le flux quand actif.
              visibility: usingFallback ? 'hidden' : 'visible',
              position: usingFallback ? 'absolute' : 'static',
              inset: usingFallback ? 0 : undefined,
              pointerEvents: usingFallback ? 'none' : undefined,
            }}
          />
          {/* Host pour html5-qrcode (fallback). Toujours monte ; on ajuste juste
              les dimensions visibles selon le mode pour eviter les races
              display:none -> inst.start qui ne resout jamais sur iOS. */}
          <div
            ref={fallbackHostRef}
            className="w-full"
            style={{
              minHeight: usingFallback ? 280 : 0,
              height: usingFallback ? 'auto' : 0,
              overflow: 'hidden',
            }}
          />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="rounded-lg border-2 border-primary-400/80" style={{ width: '70%', height: '40%' }} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'environment' ? 'user' : 'environment'))}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs hover:bg-gray-50"
          >
            <RotateCw className="h-3.5 w-3.5" />
            {facing === 'environment' ? 'Camera avant' : 'Camera arriere'}
          </button>
          <span className="text-[11px] text-gray-400">
            {usingFallback ? 'Mode compat (html5-qrcode)' : 'Mode natif (BarcodeDetector)'}
          </span>
        </div>

        {!error && !running && (
          <p className="text-xs text-gray-400">Demarrage de la camera...</p>
        )}

        {/* Saisie manuelle : derniere ressource si la camera echoue. */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
          <label className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-600">
            <Keyboard className="h-3.5 w-3.5" />
            Saisie manuelle (si la camera ne fonctionne pas)
          </label>
          <div className="flex gap-2">
            <AppInput
              placeholder="Coller / taper le tracking ou code..."
              value={manualValue}
              onChange={(e) => setManualValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && manualValue.trim()) {
                  e.preventDefault();
                  handleDetected(manualValue.trim());
                }
              }}
            />
            <AppButton
              size="sm"
              onClick={() => manualValue.trim() && handleDetected(manualValue.trim())}
              disabled={!manualValue.trim()}
            >
              Valider
            </AppButton>
          </div>
        </div>

        {/* Diagnostic embarque : ouvre le journal du scanner pour les bugs
            device-specific (utile sur mobile sans DevTools). */}
        <div className="border-t border-gray-100 pt-2">
          <button
            type="button"
            onClick={() => {
              setShowLog((s) => !s);
              if (!showLog) setLogEntries(readScanLog());
            }}
            className="inline-flex items-center gap-1 text-[11px] text-gray-500 hover:text-gray-700"
          >
            <Bug className="h-3 w-3" />
            {showLog ? 'Masquer le diagnostic' : 'Voir le diagnostic'}
          </button>
          {showLog && (
            <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 font-mono text-[10px]">
              <div className="mb-1 grid grid-cols-1 gap-0.5 text-gray-600 sm:grid-cols-2">
                <div>UA: <span className="text-gray-900">{typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 70) : '-'}</span></div>
                <div>HTTPS: <span className={typeof window !== 'undefined' && window.isSecureContext ? 'text-primary-700' : 'text-red-600 font-bold'}>{String(typeof window !== 'undefined' && window.isSecureContext)}</span></div>
                <div>BarcodeDetector: <span className="text-gray-900">{typeof window !== 'undefined' && typeof (window as any).BarcodeDetector === 'function' ? 'oui' : 'non'}</span></div>
                <div>getUserMedia: <span className="text-gray-900">{typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia ? 'oui' : 'non'}</span></div>
                <div>Mode: <span className="text-gray-900">{usingFallback ? 'fallback' : 'natif'}</span></div>
                <div>Running: <span className="text-gray-900">{String(running)}</span></div>
              </div>
              <div className="my-1 flex items-center justify-between border-y border-gray-100 py-1">
                <span className="text-gray-600">Journal ({logEntries.length})</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setLogEntries(readScanLog())}
                    className="text-primary-700 hover:underline"
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      clearScanLog();
                      setLogEntries([]);
                    }}
                    className="inline-flex items-center gap-0.5 text-red-600 hover:underline"
                  >
                    <Trash2 className="h-3 w-3" />
                    Vider
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-auto">
                {logEntries.length === 0 && (
                  <div className="py-2 text-center text-gray-400">Journal vide.</div>
                )}
                {logEntries.slice().reverse().map((e, i) => (
                  <div key={i} className="border-b border-gray-50 py-0.5 last:border-0">
                    <span className="text-gray-400">{e.ts.slice(11, 19)}</span>{' '}
                    <span className="font-semibold">{e.kind}</span>{' '}
                    {e.detail && <span className="text-gray-500">{JSON.stringify(e.detail)}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
