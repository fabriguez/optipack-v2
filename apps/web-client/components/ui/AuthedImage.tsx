'use client';

import { useEffect, useState } from 'react';
import { getToken } from '@/lib/api/client';
import { resolveMediaUrl } from '@/lib/media';

/**
 * <img> qui recupere l'image via fetch + Authorization: Bearer, puis l'affiche
 * en blob URL. Indispensable pour les endpoints API proteges (`/uploads/object/*`)
 * qu'une balise <img> classique ne peut pas atteindre (pas d'en-tete possible).
 *
 * Cache process-wide : meme URL resolue -> meme blob, pas de re-fetch.
 */

const cache = new Map<string, string>();

interface Props {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Rendu de repli quand l'image est absente ou en echec (ex: initiales). */
  fallback?: React.ReactNode;
}

export function AuthedImage({ src, alt = '', className, style, fallback = null }: Props) {
  const resolved = resolveMediaUrl(src);
  const [blob, setBlob] = useState<string | null>(() => (resolved ? cache.get(resolved) ?? null : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (!resolved) {
      setBlob(null);
      return;
    }
    const cached = cache.get(resolved);
    if (cached) {
      setBlob(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = getToken();
        const res = await fetch(resolved, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const objUrl = URL.createObjectURL(await res.blob());
        cache.set(resolved, objUrl);
        if (!cancelled) setBlob(objUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolved]);

  if (!resolved || failed) {
    return <>{fallback}</>;
  }
  if (!blob) {
    // En cours de chargement : placeholder neutre a la taille demandee.
    return <span className={className} style={style} aria-busy="true" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={blob} alt={alt} className={className} style={style} />;
}
