'use client';

import { useEffect, useRef, useState } from 'react';
import { getSession } from 'next-auth/react';
import { resolveImageUrl } from '@/lib/api/imageUrl';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

/**
 * Cache local des blob URLs : meme image utilisee plusieurs fois ne sera fetchee
 * qu'une fois par session de page. Cle = URL absolue resolue.
 */
const blobCache: Map<string, string> = new Map();
const inflight: Map<string, Promise<string>> = new Map();

async function fetchBlobUrl(absoluteUrl: string): Promise<string> {
  const cached = blobCache.get(absoluteUrl);
  if (cached) return cached;
  const existing = inflight.get(absoluteUrl);
  if (existing) return existing;

  const promise = (async () => {
    const session = await getSession();
    const token = (session as any)?.accessToken;
    const res = await fetch(absoluteUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'omit',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    blobCache.set(absoluteUrl, url);
    return url;
  })();
  inflight.set(absoluteUrl, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(absoluteUrl);
  }
}

interface AuthedImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** URL relative (/api/v1/...) ou absolue */
  src?: string | null;
  /** Affiche un fallback si l'image echoue ou si src est null */
  fallback?: React.ReactNode;
}

/**
 * <img> qui fetch l'URL avec le Bearer token et affiche un blob URL.
 * Necessaire pour les endpoints API proteges qui servent des images.
 */
export function AuthedImage({ src, fallback, alt, ...rest }: AuthedImageProps) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setResolved(null);
    setFailed(false);

    if (!src) {
      setFailed(true);
      return;
    }

    // URL externe absolue (https://...) qui n'est pas notre API : on la sert directement
    if (/^https?:\/\//i.test(src) && !src.includes(stripPath(API_BASE))) {
      setResolved(src);
      return;
    }

    const abs = resolveImageUrl(src) ?? src;
    fetchBlobUrl(abs)
      .then((blobUrl) => {
        if (!cancelledRef.current) setResolved(blobUrl);
      })
      .catch(() => {
        if (!cancelledRef.current) setFailed(true);
      });

    return () => {
      cancelledRef.current = true;
    };
  }, [src]);

  if (failed || !src) {
    return <>{fallback ?? null}</>;
  }
  if (!resolved) {
    // Placeholder en attendant le fetch
    return (
      <span
        aria-label={alt}
        className="inline-block animate-pulse bg-gray-100"
        style={{ width: rest.width ?? 'auto', height: rest.height ?? 'auto' }}
      />
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={resolved} alt={alt ?? ''} onError={() => setFailed(true)} {...rest} />;
}

function stripPath(url: string): string {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return url;
  }
}

/**
 * Telecharge un fichier protege par token (PDF, XLSX, ...) via fetch + blob.
 * Ouvre dans un nouvel onglet ou declenche un download selon `download`.
 */
export async function openAuthedFile(src: string, fileName?: string, download = false): Promise<void> {
  const session = await getSession();
  const token = (session as any)?.accessToken;
  const abs = resolveImageUrl(src) ?? src;
  const res = await fetch(abs, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'omit',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || 'fichier';
    a.click();
  } else {
    window.open(url, '_blank');
  }
  // Best-effort cleanup
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
