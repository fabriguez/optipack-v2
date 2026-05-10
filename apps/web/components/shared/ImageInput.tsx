'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, RotateCw, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { resolveImageUrl } from '@/lib/api/imageUrl';
import { AuthedImage } from './AuthedImage';
import { AppButton } from '@/components/ui/AppButton';
import { AppDialog } from '@/components/ui/AppDialog';

const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface ImageInputProps {
  /** URL actuelle a afficher en preview */
  value?: string | null;
  onFile: (file: File) => Promise<void> | void;
  onClear?: () => Promise<void> | void;
  uploading?: boolean;
  height?: number;
  label?: string;
  hint?: string;
  allowClear?: boolean;
  /** Caméra par défaut : "user" pour selfie, "environment" sinon */
  cameraFacing?: 'user' | 'environment';
  className?: string;
}

/**
 * Composant unifie : drag-drop, file picker ET capture camera (mobile/webcam).
 * Remplace ImageDropzone partout ou la capture camera est utile.
 */
export function ImageInput({
  value,
  onFile,
  onClear,
  uploading,
  height = 180,
  label,
  hint = 'Glissez une image, choisissez un fichier ou utilisez la camera',
  allowClear = true,
  cameraFacing = 'environment',
  className,
}: ImageInputProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const validate = (file: File): string | null => {
    if (!ACCEPTED.includes(file.type)) return 'Format non supporte (JPG, PNG, WEBP, GIF).';
    if (file.size > MAX_SIZE) return 'Fichier trop volumineux (max 5 MB).';
    return null;
  };

  const handleFile = useCallback(
    async (file: File) => {
      const err = validate(file);
      if (err) {
        toast.error(err);
        return;
      }
      try {
        await onFile(file);
        setPreviewError(false);
      } catch (e: any) {
        toast.error(e?.response?.data?.message || e?.message || "Echec de l'upload");
      }
    },
    [onFile],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const resolvedSrc = resolveImageUrl(value ?? null);
  const showPreview = !!resolvedSrc && !previewError;

  return (
    <div className={className}>
      {label && <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          'relative flex w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-colors',
          dragOver
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-200 bg-gray-50 hover:border-primary-300 hover:bg-primary-50/40',
        ].join(' ')}
        style={{ height }}
      >
        {showPreview ? (
          <>
            <AuthedImage
              src={value ?? null}
              alt="Apercu"
              className="h-full w-full object-cover"
              fallback={<div className="flex h-full w-full items-center justify-center text-xs text-gray-400">Image indisponible</div>}
            />
            <div className="absolute inset-0 flex items-end justify-end gap-2 bg-gradient-to-t from-black/60 to-transparent p-3 opacity-0 transition-opacity hover:opacity-100">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
                className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium shadow"
              >
                <Upload className="h-3.5 w-3.5" />
                Changer
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCamera(true);
                }}
                className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium shadow"
              >
                <Camera className="h-3.5 w-3.5" />
                Camera
              </button>
              {allowClear && onClear && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      await onClear();
                    } catch (err: any) {
                      toast.error(err?.response?.data?.message || 'Suppression impossible');
                    }
                  }}
                  className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-red-600 shadow"
                >
                  <X className="h-3.5 w-3.5" />
                  Supprimer
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-50">
              <ImagePlus className="h-6 w-6 text-primary-600" />
            </div>
            <p className="text-sm font-medium text-gray-700">Cliquez ou deposez une image</p>
            <p className="text-xs text-gray-500">{hint}</p>
            <div className="mt-1 flex items-center gap-2">
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCamera(true);
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3 py-1.5 text-xs font-medium text-white shadow hover:bg-primary-700"
              >
                <Camera className="h-3.5 w-3.5" />
                Filmer
              </span>
            </div>
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-6 w-6 animate-spin text-primary-600" />
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={onChange}
      />

      {showCamera && (
        <CameraCaptureDialog
          open={showCamera}
          onClose={() => setShowCamera(false)}
          initialFacing={cameraFacing}
          onCapture={async (file) => {
            setShowCamera(false);
            await handleFile(file);
          }}
        />
      )}
    </div>
  );
}

interface CameraCaptureDialogProps {
  open: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
  initialFacing: 'user' | 'environment';
}

export function CameraCaptureDialog({ open, onClose, onCapture, initialFacing }: CameraCaptureDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>(initialFacing);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const start = async () => {
      setError(null);
      try {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e: any) {
        const msg = e?.name === 'NotAllowedError'
          ? 'Acces camera refuse. Autorisez la camera dans les parametres.'
          : e?.message || 'Impossible de demarrer la camera.';
        setError(msg);
      }
    };
    start();
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, facing]);

  const capture = async () => {
    if (!videoRef.current) return;
    setBusy(true);
    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      const w = video.videoWidth;
      const h = video.videoHeight;
      if (!w || !h) {
        toast.error('Camera pas prete, reessayez.');
        return;
      }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, w, h);
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9),
      );
      if (!blob) {
        toast.error('Echec de la capture.');
        return;
      }
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppDialog
      open={open}
      onClose={onClose}
      title="Prendre une photo"
      size="md"
      footer={
        <>
          <AppButton variant="ghost" onClick={onClose}>Annuler</AppButton>
          <AppButton onClick={capture} loading={busy}>Capturer</AppButton>
        </>
      }
    >
      <div className="space-y-3">
        {error ? (
          <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-center text-sm text-red-700">
            {error}
          </div>
        ) : (
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <Camera className="h-3.5 w-3.5" />
            Cadrez votre sujet, puis cliquez sur Capturer.
          </p>
        )}
        <div className="overflow-hidden rounded-xl bg-black/95">
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            className="h-auto w-full"
            style={{ minHeight: 240 }}
          />
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs"
          >
            <RotateCw className="h-3.5 w-3.5" />
            {facing === 'user' ? 'Camera arriere' : 'Camera avant (selfie)'}
          </button>
          <span className="text-[11px] text-gray-400">JPEG, qualite 90%</span>
        </div>
      </div>
    </AppDialog>
  );
}
