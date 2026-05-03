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

const QR_REGION_ID = 'qr-scanner-region';

/**
 * Scanner QR base sur html5-qrcode. Demande l'acces camera, prefere la
 * camera arriere (`facingMode: environment`) sur mobile.
 */
export function QRScannerDialog({
  open,
  onClose,
  onDetected,
  title = 'Scanner un QR code',
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
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;

        // Liste des cameras disponibles
        try {
          const devices = await Html5Qrcode.getCameras();
          if (!cancelled && devices?.length) {
            setCameras(devices.map((d) => ({ id: d.id, label: d.label || 'Camera' })));
          }
        } catch {
          // certains navigateurs requierent que getUserMedia soit appele d'abord ;
          // on tombera dans le start() ci-dessous qui lance getUserMedia.
        }

        if (cancelled) return;
        const inst = new Html5Qrcode(QR_REGION_ID, { verbose: false });
        scannerRef.current = inst;

        const cameraConfig = cameraId
          ? cameraId
          : ({ facingMode: { ideal: 'environment' } } as MediaTrackConstraints);

        await inst.start(
          cameraConfig,
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (decodedText) => {
            onDetected(decodedText);
            if (closeOnDetect) {
              inst.stop().catch(() => {});
              onClose();
            }
          },
          () => {
            // erreur de scan par frame (ignoree, normale)
          },
        );
        if (!cancelled) setRunning(true);
      } catch (e: any) {
        const msg =
          e?.message?.includes('Permission')
            ? "Acces camera refuse. Autorisez la camera dans les parametres du navigateur."
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
            Placez le QR code dans le cadre. La detection est automatique.
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
