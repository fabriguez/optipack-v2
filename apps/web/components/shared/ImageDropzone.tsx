'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { resolveImageUrl } from '@/lib/api/imageUrl';
import { AuthedImage } from './AuthedImage';

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface ImageDropzoneProps {
  /** URL actuelle a afficher en preview (passe de l'agence existante) */
  value?: string | null;
  /** Appele quand un fichier valide est choisi */
  onFile: (file: File) => Promise<void> | void;
  /** Appele si on demande la suppression de l'image */
  onClear?: () => Promise<void> | void;
  /** Etat externe : true tant que l'upload n'est pas termine */
  uploading?: boolean;
  /** Hauteur du dropzone (px). Defaut 180. */
  height?: number;
  label?: string;
  hint?: string;
  /** Si true, affiche un bouton "Supprimer" en plus de "Changer" */
  allowClear?: boolean;
  className?: string;
}

/**
 * Composant d'upload d'image avec drag-and-drop, file picker et preview.
 * Auto-resilient : valide type + taille avant d'appeler onFile.
 */
export function ImageDropzone({
  value,
  onFile,
  onClear,
  uploading,
  height = 180,
  label,
  hint = 'Glissez une image ici ou cliquez pour parcourir (JPG, PNG, WEBP, max 5 MB)',
  allowClear = true,
  className,
}: ImageDropzoneProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewError, setPreviewError] = useState(false);

  const validate = (file: File): string | null => {
    if (!ACCEPTED.includes(file.type)) return 'Format non supporte. Utilisez JPG, PNG, WEBP ou GIF.';
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
        toast.error(e?.response?.data?.message || e?.message || 'Echec de l\'upload');
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
    // permet de re-uploader le meme fichier
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
    </div>
  );
}
