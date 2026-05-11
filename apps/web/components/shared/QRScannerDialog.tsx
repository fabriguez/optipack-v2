'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw, RotateCw, Keyboard, Bug, Trash2, Volume2, VolumeX, ScanLine, X } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';
import { scanLog, readScanLog, clearScanLog, type ScanDebugEntry } from '@/lib/api/scanDebug';
import { scanSound } from '@/lib/utils/scanSound';

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
  /**
   * Liste de codes deja accumules a afficher en temps reel sous la camera.
   * Permet a l'utilisateur de scanner en chaine sans devoir fermer le dialog
   * pour verifier ce qui a ete capture. Si absent, l'ancien comportement est
   * conserve (camera seule).
   */
  accumulatedCodes?: string[];
  /** Callback pour retirer un code de la liste accumulee (croix par item). */
  onRemoveAccumulatedCode?: (code: string) => void;
  /** Callback pour vider toute la liste accumulee. */
  onClearAccumulated?: () => void;
}

/**
 * Scanner QR + codes-barres avec lifecycle robuste.
 *
 * Strategie a 2 niveaux :
 *  1. BarcodeDetector natif (Chrome / Edge / Android) : fluide, sans dependance.
 *  2. Fallback @zxing/browser (Safari iOS, Firefox, etc.) : decodeur le plus
 *     robuste sur iOS, supporte tous les formats 1D/2D, attache au meme
 *     <video> que la branche native (pas de double getUserMedia).
 *
 * Lifecycle critique :
 *  - aliveRef garde toute mutation d'etat dans la session courante du dialog.
 *    Si l'utilisateur ferme avant que getUserMedia / decoder.start aient repondu,
 *    on ignore le resultat tardif au lieu de setState sur un dialog ferme.
 *  - stopAll() est idempotent et awaitable.
 */
export function QRScannerDialog({
  open,
  onClose,
  onDetected,
  title = 'Scanner (QR / code-barres)',
  closeOnDetect = true,
  accumulatedCodes,
  onRemoveAccumulatedCode,
  onClearAccumulated,
}: QRScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Controles ZXing (objet {stop()}) ou null. Quand on est en fallback ZXing,
  // ZXing gere lui-meme l'appel a getUserMedia donc streamRef peut etre null.
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const aliveRef = useRef(false);
  const stoppingRef = useRef<Promise<void> | null>(null);
  const detectedOnceRef = useRef(false);

  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState<ScanDebugEntry[]>([]);
  const [muted, setMuted] = useState(scanSound.isMuted());

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
      // Stop ZXing en premier : il referme aussi le stream qu'il a ouvert.
      if (zxingControlsRef.current) {
        try {
          zxingControlsRef.current.stop();
        } catch {
          // ignore
        }
        zxingControlsRef.current = null;
      }
      // Stop notre stream getUserMedia (branche native uniquement).
      if (streamRef.current) {
        try {
          streamRef.current.getTracks().forEach((t) => t.stop());
        } catch {
          // ignore
        }
        streamRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.srcObject = null;
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
    const cleaned = text.trim();
    if (cleaned.length < MIN_VALID_LENGTH) {
      scanLog('detect.ignored.too-short', { text: cleaned, len: cleaned.length });
      return;
    }
    // eslint-disable-next-line no-control-regex
    if (/^[\x00-\x1f\x7f]+$/.test(cleaned)) {
      scanLog('detect.ignored.control-chars', { sample: cleaned.slice(0, 20) });
      return;
    }
    scanLog('detect.accepted', { text: cleaned, mode: usingFallback ? 'fallback' : 'native' });
    // Bip neutre confirmant une lecture brute. Le verdict metier (existe / deja
    // scanne / inconnu) est joue par l'appelant via scanSound.success/error.
    scanSound.info();
    detectedOnceRef.current = true;
    onDetected(cleaned);
    if (closeOnDetect) {
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

        if (!hasNative) {
          scanLog('mode.zxing');
          await runZxing();
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
        scanSound.error();
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
        // BarcodeDetector existe mais l'instanciation echoue (Safari Mac).
        await runZxing();
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

    /**
     * Fallback ZXing : decodeur le plus robuste sur iOS Safari pour les codes
     * barres 1D et 2D. Il prend en main le <video> directement (pas de double
     * getUserMedia comme avec html5-qrcode).
     */
    const runZxing = async () => {
      safe.setUsingFallback(true);
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
        if (!aliveRef.current || !videoRef.current) return;
        // Laisse React poser le <video> visible avant de demarrer.
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
        if (!aliveRef.current || !videoRef.current) return;

        const hints = new Map();
        // On ouvre largement les formats : QR + tous les codes barres lineaires
        // courants sur les colis (CODE_128, CODE_39, EAN, UPC, ITF, CODABAR,
        // DATA_MATRIX, AZTEC, PDF_417).
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.QR_CODE,
          BarcodeFormat.AZTEC,
          BarcodeFormat.DATA_MATRIX,
          BarcodeFormat.PDF_417,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.CODE_93,
          BarcodeFormat.CODABAR,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.ITF,
        ]);
        // TRY_HARDER : autorise une recherche plus lente mais bien plus fiable
        // sur les codes mal eclaires / inclines (tres frequent sur colis).
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);

        scanLog('zxing.start.before', { facing });
        // ZXing ouvre lui-meme getUserMedia avec la contrainte facingMode.
        // L'API moderne renvoie un IScannerControls avec stop().
        const controls = await reader.decodeFromConstraints(
          {
            video: { facingMode: { ideal: facing } },
            audio: false,
          },
          videoRef.current,
          (result, _err) => {
            if (!aliveRef.current) return;
            if (result) {
              handleDetected(result.getText());
            }
            // _err : NotFoundException sur chaque frame sans code -> on ignore.
          },
        );
        scanLog('zxing.start.after');

        if (!aliveRef.current) {
          try {
            controls.stop();
          } catch {
            // ignore
          }
          return;
        }
        zxingControlsRef.current = controls;
        safe.setRunning(true);
      } catch (e: any) {
        const serialized = {
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
        };
        scanLog('zxing.start.error', serialized);
        if (!aliveRef.current) return;
        const userMsg =
          e?.name === 'NotAllowedError'
            ? 'Acces camera refuse. Autorisez la camera dans les parametres.'
            : e?.message || (typeof e === 'string' ? e : null) || 'Impossible de demarrer le scanner.';
        safe.setError(userMsg);
        safe.setRunning(false);
        scanSound.error();
      }
    };

    void start();

    return () => {
      scanLog('cleanup', { reason: 'effect-cleanup' });
      aliveRef.current = false;
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
            style={{ minHeight: 280 }}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const next = !muted;
                setMuted(next);
                scanSound.setMuted(next);
                if (!next) scanSound.info();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] hover:bg-gray-50"
              title={muted ? 'Activer le son' : 'Couper le son'}
            >
              {muted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
              {muted ? 'Son OFF' : 'Son ON'}
            </button>
            <span className="text-[11px] text-gray-400">
              {usingFallback ? 'Mode compat (ZXing)' : 'Mode natif (BarcodeDetector)'}
            </span>
          </div>
        </div>

        {!error && !running && (
          <p className="text-xs text-gray-400">Demarrage de la camera...</p>
        )}

        {accumulatedCodes && (
          <div className="rounded-xl border border-primary-100 bg-primary-50/40">
            <div className="flex items-center justify-between border-b border-primary-100/60 px-3 py-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-900">
                <ScanLine className="h-3.5 w-3.5" />
                {accumulatedCodes.length} code{accumulatedCodes.length > 1 ? 's' : ''} scanne{accumulatedCodes.length > 1 ? 's' : ''}
              </span>
              {accumulatedCodes.length > 0 && onClearAccumulated && (
                <button
                  type="button"
                  onClick={onClearAccumulated}
                  className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline"
                >
                  <Trash2 className="h-3 w-3" />
                  Tout vider
                </button>
              )}
            </div>
            {accumulatedCodes.length === 0 ? (
              <div className="p-3 text-center text-[11px] text-gray-500">
                Scannez un code, il apparaitra ici en temps reel. Continuez a scanner sans fermer.
              </div>
            ) : (
              <ul className="max-h-44 divide-y divide-primary-100/60 overflow-auto">
                {accumulatedCodes
                  .slice()
                  .reverse()
                  .map((c, i) => {
                    const num = accumulatedCodes.length - i;
                    return (
                      <li
                        key={c}
                        className={`flex items-center justify-between px-3 py-1.5 text-xs ${i === 0 ? 'bg-primary-100/50' : ''}`}
                      >
                        <span className="font-mono text-gray-700">
                          <span className="mr-2 text-gray-400">#{num}</span>
                          {c}
                          {i === 0 && (
                            <span className="ml-2 rounded bg-primary-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              nouveau
                            </span>
                          )}
                        </span>
                        {onRemoveAccumulatedCode && (
                          <button
                            type="button"
                            onClick={() => onRemoveAccumulatedCode(c)}
                            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            aria-label="Retirer"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        )}

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
                <div>Mode: <span className="text-gray-900">{usingFallback ? 'zxing' : 'natif'}</span></div>
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
