'use client';

import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X, Camera, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AuthedImage } from '@/components/shared/AuthedImage';
import { AppInput } from '@/components/ui/AppInput';
import { useParcelImages } from '@/lib/hooks/useParcels';
import type { ParcelImage } from '@/lib/api/parcels';

const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export interface PendingImage {
  id: string; // local uuid
  file: File;
  previewUrl: string;
  caption: string;
}

interface Props {
  /** parcelId si mode edition (charge les images existantes) ; null si creation. */
  parcelId: string | null;
  /** Nouvelles images a uploader apres save (controle parent). */
  pending: PendingImage[];
  onPendingChange: (next: PendingImage[]) => void;
  /** IDs des images existantes marquees pour suppression. */
  removed: string[];
  onRemovedChange: (next: string[]) => void;
}

/**
 * Champ multi-images integre au formulaire de colis. La gestion d'upload reelle
 * se fait dans le parent au moment du submit (deux requetes : create/update du
 * colis, puis upload + addImage par fichier).
 */
export function ParcelImagesField({
  parcelId,
  pending,
  onPendingChange,
  removed,
  onRemovedChange,
}: Props) {
  const { data: imagesData } = useParcelImages(parcelId ?? '');
  const existingImages: ParcelImage[] = parcelId ? (imagesData?.data ?? []) : [];

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Cleanup des object URLs quand le composant se demonte ou quand on retire un fichier.
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = (file: File): string | null => {
    if (!ACCEPTED.includes(file.type)) return `${file.name}: format non supporte (JPG, PNG, WEBP, GIF)`;
    if (file.size > MAX_SIZE) return `${file.name}: fichier trop volumineux (max 5 MB)`;
    return null;
  };

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const accepted: PendingImage[] = [];
    for (const f of arr) {
      const err = validate(f);
      if (err) {
        toast.error(err);
        continue;
      }
      accepted.push({
        id: `local-${Math.random().toString(36).slice(2, 10)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        caption: '',
      });
    }
    if (accepted.length > 0) onPendingChange([...pending, ...accepted]);
  };

  const removePending = (id: string) => {
    const item = pending.find((p) => p.id === id);
    if (item) URL.revokeObjectURL(item.previewUrl);
    onPendingChange(pending.filter((p) => p.id !== id));
  };

  const updateCaption = (id: string, caption: string) => {
    onPendingChange(pending.map((p) => (p.id === id ? { ...p, caption } : p)));
  };

  const toggleRemoveExisting = (imageId: string) => {
    if (removed.includes(imageId)) {
      onRemovedChange(removed.filter((id) => id !== imageId));
    } else {
      onRemovedChange([...removed, imageId]);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Photos du colis</label>
        <p className="text-xs text-gray-500">
          {(existingImages.length - removed.length) + pending.length} photo(s) au total
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={`grid grid-cols-2 gap-3 rounded-xl border-2 border-dashed p-3 sm:grid-cols-3 lg:grid-cols-4 ${
          dragOver ? 'border-primary-500 bg-primary-50/40' : 'border-gray-200'
        }`}
      >
        {/* Images existantes (mode edition uniquement) */}
        {existingImages.map((img) => {
          const isRemoved = removed.includes(img.id);
          return (
            <div
              key={img.id}
              className={`relative overflow-hidden rounded-lg border ${
                isRemoved ? 'opacity-40 border-red-300' : 'border-gray-200'
              }`}
            >
              <AuthedImage src={img.url} alt={img.caption ?? ''} className="aspect-square w-full object-cover" />
              <button
                type="button"
                onClick={() => toggleRemoveExisting(img.id)}
                className={`absolute right-1 top-1 rounded-full p-1 text-white shadow ${
                  isRemoved ? 'bg-gray-500' : 'bg-red-500 hover:bg-red-600'
                }`}
                title={isRemoved ? 'Annuler la suppression' : 'Supprimer'}
              >
                <X className="h-3 w-3" />
              </button>
              {img.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-[10px] text-white truncate">
                  {img.caption}
                </div>
              )}
              {isRemoved && (
                <div className="absolute inset-0 flex items-center justify-center bg-red-900/30 text-[11px] font-bold text-white">
                  A SUPPRIMER
                </div>
              )}
            </div>
          );
        })}

        {/* Pending : a uploader apres save */}
        {pending.map((p) => (
          <div key={p.id} className="relative overflow-hidden rounded-lg border border-primary-300">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.previewUrl} alt="apercu" className="aspect-square w-full object-cover" />
            <button
              type="button"
              onClick={() => removePending(p.id)}
              className="absolute right-1 top-1 rounded-full bg-red-500 p-1 text-white shadow hover:bg-red-600"
              title="Retirer"
            >
              <X className="h-3 w-3" />
            </button>
            <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
              <input
                value={p.caption}
                onChange={(e) => updateCaption(p.id, e.target.value)}
                placeholder="Legende (optionnel)"
                className="w-full bg-transparent text-[10px] text-white placeholder:text-gray-300 focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div className="absolute left-1 top-1 rounded bg-primary-500 px-1.5 py-0.5 text-[9px] font-bold text-white">
              NOUVEAU
            </div>
          </div>
        ))}

        {/* Bouton ajouter */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-gray-300 text-xs text-gray-500 hover:border-primary-400 hover:bg-primary-50/30"
        >
          <ImagePlus className="h-6 w-6" />
          Ajouter
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            addFiles(e.target.files);
            // Reset value to allow re-picking the same file later
            e.target.value = '';
          }
        }}
      />

      <p className="text-[11px] text-gray-400">
        Les photos sont uploadees a l&apos;enregistrement du colis (deux requetes : creation
        du colis, puis upload de chaque image). Glisser-deposer supporte. JPG/PNG/WEBP/GIF, 5 MB max par image.
      </p>
    </div>
  );
}

/**
 * Helper utilise par le parent au submit : prend les pending images, les uploade
 * et les attache au colis. Supprime aussi les images marquees a retirer.
 * Renvoie un objet { added, removed, errors } pour info.
 */
export async function persistParcelImages(
  parcelId: string,
  pending: PendingImage[],
  removed: string[],
  uploadImage: (f: File) => Promise<{ url: string }>,
  addImage: (id: string, payload: { url: string; caption?: string; isPrimary?: boolean }) => Promise<unknown>,
  removeImage: (id: string, imageId: string) => Promise<unknown>,
): Promise<{ added: number; removed: number; errors: string[] }> {
  const errors: string[] = [];
  let added = 0;
  let removedCount = 0;

  // Uploads en parallele : chaque echec est isole, ne bloque pas les autres.
  await Promise.all(
    pending.map(async (p) => {
      try {
        const up = await uploadImage(p.file);
        await addImage(parcelId, { url: up.url, caption: p.caption.trim() || undefined });
        added += 1;
      } catch (e: any) {
        errors.push(`${p.file.name}: ${e?.response?.data?.message ?? e?.message ?? 'echec upload'}`);
      } finally {
        URL.revokeObjectURL(p.previewUrl);
      }
    }),
  );

  await Promise.all(
    removed.map(async (imgId) => {
      try {
        await removeImage(parcelId, imgId);
        removedCount += 1;
      } catch (e: any) {
        errors.push(`suppression image: ${e?.response?.data?.message ?? e?.message ?? 'echec'}`);
      }
    }),
  );

  return { added, removed: removedCount, errors };
}
