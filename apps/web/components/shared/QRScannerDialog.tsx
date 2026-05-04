'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, RefreshCw } from 'lucide-react';
import { AppDialog } from '@/components/ui/AppDialog';
import { AppButton } from '@/components/ui/AppButton';

interface QRScannerDialogProps {
  open: boolean;
  onClose: () => void;
  onDetected: (decoded: string) => void;
  title?: string;
  /**
   * Si true (defaut), le dialogue se ferme automatiquement apres detection.
   * Si false, l'appelant gere la fermeture (utile pour scan continu).
   */
  closeOnDetect?: boolean;
}

/**
 * Scanner polyvalent : QR codes ET codes-barres (EAN, UPC, Code128/39/93, ITF,
 * Codabar, Aztec, Data Matrix, PDF417). Demande l'acces camera, prefere la
 * camera arriere (`facingMode: environment`) sur mobile.
 */

const QR_REGION_ID = 'qr-scanner-region';

export function QRScannerDialog({
  open,
  onClose,
  onDetected,
  title = 'Scanner (QR / code-barres)',
  closeOnDetect = true,
}: QRScannerDialogProps) {
  const scannerRef = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const start = async () => {
      setError(null);
      try {
        // Pre-flight : sur certains navigateurs (Safari iOS, Chrome strict), getCameras
        // ne renvoie rien tant que getUserMedia n'a pas ete appele au moins une fois.
        // On declenche un getUserMedia pour deverrouiller la liste, puis on l'arrete.
        if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
          try {
            const probe = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
            probe.getTracks().forEach((t) => t.stop());
          } catch {
            // sera capte plus bas par Html5Qrcode si vraiment refuse
          }
        }

        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');
        if (cancelled) return;

        // Liste des cameras disponibles
        try {
          const devices = await Html5Qrcode.getCameras();
          if (!cancelled && devices?.length) {
            setCameras(devices.map((d) => ({ id: d.id, label: d.label || 'Camera' })));
          }
        } catch {
          // ignore
        }

        if (cancelled) return;

        // Polyvalent : QR + codes-barres usuels (EAN, UPC, Code128, Code39, ITF, Codabar)
        const supportedFormats = [
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

        const inst = new Html5Qrcode(QR_REGION_ID, {
          verbose: false,
          formatsToSupport: supportedFormats,
        });
        scannerRef.current = inst;

        const cameraConfig = cameraId
          ? cameraId
          : ({ facingMode: { ideal: 'environment' } } as MediaTrackConstraints);

        // qrbox plus large + ratio adapte aux codes-barres lineaires
        const qrbox = (vw: number, vh: number) => {
          const min = Math.min(vw, vh);
          const w = Math.floor(min * 0.8);
          const h = Math.floor(min * 0.5);
          return { width: w, height: h };
        };

        await inst.start(
          cameraConfig,
          {
            fps: 15,
            qrbox,
            aspectRatio: 1.0,
            disableFlip: false,
          },
          (decodedText) => {
            onDetected(decodedText);
            if (closeOnDetect) {
              inst.stop().catch(() => {});
              onClose();
            }
          },
          () => {
            // erreur par frame (ignoree)
          },
        );
        if (!cancelled) setRunning(true);
      } catch (e: any) {
        const msg =
          e?.name === 'NotAllowedError' || e?.message?.toLowerCase()?.includes('permission')
            ? "Acces camera refuse. Autorisez la camera dans les parametres du navigateur."
            : e?.name === 'NotFoundError'
              ? "Aucune camera detectee sur cet appareil."
              : e?.name === 'NotReadableError'
                ? "Camera deja utilisee par une autre application."
                : e?.message || 'Impossible de demarrer la camera.';
        setError(msg);
        setRunning(false);
      }
    };

    start();

    return () => {
      cancelled = true;
      const inst = scannerRef.current;
      if (inst) {
        inst.stop().catch(() => {}).finally(() => {
          try { inst.clear(); } catch {}
        });
        scannerRef.current = null;
      }
      setRunning(false);
    };
    // on relance si on change de camera
  }, [open, cameraId]); // eslint-disable-line react-hooks/exhaustive-deps

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
            <AppButton size="sm" variant="outline" onClick={() => setCameraId((v) => (v ? null : v))}>
              <RefreshCw className="h-3.5 w-3.5" />
              Reessayer
            </AppButton>
          </div>
        ) : (
          <p className="text-xs text-gray-500 flex items-center gap-1">
            <Camera className="h-3.5 w-3.5" />
            Placez le QR ou le code-barres dans le cadre. La detection est automatique.
          </p>
        )}

        <div
          id={QR_REGION_ID}
          className="overflow-hidden rounded-xl bg-black/95 [&_video]:w-full [&_video]:h-auto"
          style={{ minHeight: 280 }}
        />

        {cameras.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500">Camera :</label>
            <select
              className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-sm"
              value={cameraId ?? ''}
              onChange={(e) => setCameraId(e.target.value || null)}
            >
              <option value="">Auto (arriere)</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {!error && !running && (
          <p className="text-xs text-gray-400">Demarrage de la camera...</p>
        )}
      </div>
    </AppDialog>
  );
}
