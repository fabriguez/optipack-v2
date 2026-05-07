'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw, RotateCw, Keyboard } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';
import { AppInput } from '@/components/ui/AppInput';

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onDetected: (decoded: string) => void;
  title?: string;
  closeOnDetect?: boolean;
}

/**
 * Scanner polyvalent QR + codes-barres.
 *
 * Strategie a 2 niveaux :
 *  1. BarcodeDetector natif (Chrome / Edge / Android Webview) : tres fluide,
 *     pas de dependance externe. Detecte QR + EAN + UPC + Code128/39/93 + ITF
 *     + Aztec + Data Matrix + PDF417.
 *  2. Fallback html5-qrcode pour Safari / Firefox / navigateurs sans
 *     BarcodeDetector. Memes formats supportes.
 *
 * Dans les 2 cas on utilise un <video> avec getUserMedia (memes primitives que
 * ImageInput.CameraCaptureDialog), donc si la camera marche dans l'ImageInput,
 * elle marche ici. C'est l'instanciation du wrapper qui posait probleme avant.
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

  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [usingFallback, setUsingFallback] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const detectedOnceRef = useRef(false);

  const stopAll = () => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const inst = html5QrRef.current;
    if (inst) {
      inst.stop().catch(() => {}).finally(() => {
        try { inst.clear(); } catch {}
      });
      html5QrRef.current = null;
    }
  };

  const handleDetected = (text: string) => {
    if (!text || detectedOnceRef.current) return;
    detectedOnceRef.current = true;
    onDetected(text);
    if (closeOnDetect) {
      stopAll();
      onClose();
    } else {
      // Permet une nouvelle detection apres un court delai (scan continu)
      setTimeout(() => {
        detectedOnceRef.current = false;
      }, 1500);
    }
  };

  useEffect(() => {
    if (!open) return;
    detectedOnceRef.current = false;
    setError(null);
    setRunning(false);
    let cancelled = false;

    const start = async () => {
      try {
        // 1) Demande getUserMedia avec la facing camera demandee.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // 2) Branche le stream sur le <video>.
        if (!videoRef.current) {
          // Safari : il arrive que le portal n'ait pas encore mis le <video>
          // dans le DOM. On attend un tick puis on retente.
          await new Promise((r) => setTimeout(r, 50));
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
          setRunning(true);
        }

        // 3) Detection : BarcodeDetector natif si dispo, sinon html5-qrcode.
        const BarcodeDetector = (window as any).BarcodeDetector;
        if (BarcodeDetector && typeof BarcodeDetector === 'function') {
          await runNative(stream);
        } else {
          await runFallback();
        }
      } catch (e: any) {
        const msg =
          e?.name === 'NotAllowedError'
            ? 'Acces camera refuse. Autorisez la camera dans les parametres.'
            : e?.name === 'NotFoundError'
              ? 'Aucune camera detectee.'
              : e?.name === 'NotReadableError'
                ? 'Camera deja utilisee par une autre application.'
                : e?.message || 'Impossible de demarrer la camera.';
        setError(msg);
        setRunning(false);
      }
    };

    const runNative = async (_stream: MediaStream) => {
      const BarcodeDetector = (window as any).BarcodeDetector;
      // Liste des formats : on prend le maximum supporte par le navigateur.
      let formats: string[] = ['qr_code'];
      try {
        const supported: string[] = await BarcodeDetector.getSupportedFormats();
        formats = supported && supported.length ? supported : formats;
      } catch {
        // ignore
      }
      let detector: any;
      try {
        detector = new BarcodeDetector({ formats });
      } catch {
        // BarcodeDetector existe mais l'instanciation echoue (Safari Mac sans support reel)
        // -> bascule sur le fallback html5-qrcode.
        await runFallback();
        return;
      }

      const tick = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length) {
            const value = codes[0].rawValue || codes[0].value;
            if (value) handleDetected(String(value));
          }
        } catch {
          // ignore frame error
        }
        if (!cancelled) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const runFallback = async () => {
      // On utilise html5-qrcode mais en mode "image-from-video" : on lui passe
      // explicitement un canvas qui capture le <video> existant. Plus robuste
      // que de laisser html5-qrcode gerer son propre <video>.
      setUsingFallback(true);
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (!fallbackHostRef.current) return;
        // Donne un id unique au host pour Html5Qrcode
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
        html5QrRef.current = inst;

        // Coupe notre stream getUserMedia : html5-qrcode va prendre la main.
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;

        await inst.start(
          { facingMode: { ideal: facing } } as MediaTrackConstraints,
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
        setRunning(true);
      } catch (e: any) {
        setError(e?.message || 'Impossible de demarrer le scanner.');
        setRunning(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      stopAll();
      setRunning(false);
      setUsingFallback(false);
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
            className={`h-auto w-full ${usingFallback ? 'hidden' : ''}`}
            style={{ minHeight: 280 }}
          />
          {/* Host pour html5-qrcode (fallback) */}
          <div
            ref={fallbackHostRef}
            className={usingFallback ? 'block w-full' : 'hidden'}
            style={{ minHeight: 280 }}
          />
          {/* Cadre de visee */}
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

        {/* Saisie manuelle : toujours disponible en derniere ressource si la
            camera echoue ou si l'utilisateur prefere taper / coller le code. */}
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
      </div>
    </AppDialog>
  );
}
