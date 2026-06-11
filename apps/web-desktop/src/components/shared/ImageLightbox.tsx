'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, X, ZoomIn, ZoomOut } from 'lucide-react';
import { AuthedImage, openAuthedFile } from './AuthedImage';

export interface LightboxImage {
  url: string;
  caption?: string | null;
}

interface ImageLightboxProps {
  images: LightboxImage[];
  /** Index de l'image ouverte. null = ferme. */
  index: number | null;
  onClose: () => void;
  onIndexChange?: (next: number) => void;
}

/**
 * Lightbox simple : backdrop sombre, image centree, navigation +/- entre
 * plusieurs images, zoom in/out, fermeture Escape ou clic backdrop. Utilise
 * AuthedImage pour passer le Bearer token sur les images privees.
 */
export function ImageLightbox({ images, index, onClose, onIndexChange }: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const [zoom, setZoom] = useState(1);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { setZoom(1); }, [index]);

  const goPrev = useCallback(() => {
    if (index == null || images.length === 0) return;
    const next = (index - 1 + images.length) % images.length;
    onIndexChange?.(next);
  }, [index, images.length, onIndexChange]);

  const goNext = useCallback(() => {
    if (index == null || images.length === 0) return;
    const next = (index + 1) % images.length;
    onIndexChange?.(next);
  }, [index, images.length, onIndexChange]);

  useEffect(() => {
    if (index == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z * 1.25, 5));
      else if (e.key === '-') setZoom((z) => Math.max(z / 1.25, 0.5));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, onClose, goPrev, goNext]);

  if (!mounted || index == null || !images[index]) return null;

  const current = images[index];
  const hasMany = images.length > 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label="Apercu image"
      onClick={onClose}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-in fade-in duration-150"
    >
      {/* Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(z / 1.25, 0.5)); }}
          className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
          aria-label="Zoom arriere"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(z * 1.25, 5)); }}
          className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
          aria-label="Zoom avant"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const fileName = current.caption?.replace(/[^\w.-]+/g, '_') || `image-${index + 1}`;
            void openAuthedFile(current.url, fileName, true).catch(() => {});
          }}
          className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
          aria-label="Telecharger"
        >
          <Download className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="rounded-lg bg-white/10 p-2 text-white transition hover:bg-white/20"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Counter */}
      {hasMany && (
        <div className="absolute top-4 left-4 z-10 rounded-lg bg-white/10 px-3 py-1 text-sm text-white">
          {index + 1} / {images.length}
        </div>
      )}

      {/* Prev */}
      {hasMany && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-3 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
          aria-label="Image precedente"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Image */}
      <div
        className="relative flex max-h-[90vh] max-w-[92vw] items-center justify-center overflow-auto"
        onClick={(e) => e.stopPropagation()}
        style={{ cursor: zoom > 1 ? 'grab' : 'default' }}
      >
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'center', transition: 'transform 120ms ease-out' }}>
          <AuthedImage
            src={current.url}
            alt={current.caption || 'Image'}
            className="max-h-[90vh] max-w-[92vw] select-none object-contain"
          />
        </div>
      </div>

      {/* Next */}
      {hasMany && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="absolute right-3 z-10 rounded-full bg-white/10 p-3 text-white transition hover:bg-white/20"
          aria-label="Image suivante"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Caption */}
      {current.caption && (
        <div
          className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-[80vw] rounded-lg bg-black/60 px-4 py-2 text-center text-sm text-white"
          onClick={(e) => e.stopPropagation()}
        >
          {current.caption}
        </div>
      )}
    </div>,
    document.body,
  );
}
