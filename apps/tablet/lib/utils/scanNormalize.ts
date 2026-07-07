/**
 * Normalise une valeur scannee (QR / code-barres) pour en extraire le tracking
 * number reel.
 *
 * Cas couverts :
 *   - URL avec tracking en query : "https://app.transitsoftservices.com/track?q=TST-ABC"
 *     -> "TST-ABC"
 *   - URL de suivi : "https://app.transitsoftservices.com/tracking/TST-ABC"
 *     -> "TST-ABC"
 *   - URL avec hash/query : "https://.../tracking/TST-ABC?foo=bar#x"
 *     -> "TST-ABC"
 *   - Valeur brute : "TST-ABC" -> "TST-ABC"
 *   - Whitespace / line break ajoute par le scanner : trimme
 *   - Cas null / undefined : retourne ''
 *
 * Les QR des colis encodent l'URL complete (pour permettre un suivi public en
 * scannant). Les consommateurs metier (chargement, dechargement, inventaire,
 * ...) ont besoin du tracking number sec. Cette fonction fait le pont sans
 * changer la generation du QR.
 */
export function normalizeScannedTracking(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // URL absolue : le tracking peut etre soit en query (?q=), soit dans le path.
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      // 1) Tracking en query param : "/track?q=TST-ABC" (QR public actuel).
      const q =
        u.searchParams.get('q') ||
        u.searchParams.get('tracking') ||
        u.searchParams.get('trackingNumber');
      if (q) return q.trim();
      // 2) Tracking dans le path : "/tracking/TST-ABC".
      const pathMatch = u.pathname.match(/\/tracking\/([^/?#\s]+)/i);
      if (pathMatch) return pathMatch[1].trim();
      // 3) Heuristique : dernier segment du path.
      const segs = u.pathname.split('/').filter(Boolean);
      const last = segs[segs.length - 1];
      if (last) return last.trim();
    }
  } catch {
    // Pas une URL valide -> on retombe sur la valeur trimmee.
  }

  // Chaine relative "/tracking/TST-ABC" sans schema.
  const trackingMatch = trimmed.match(/\/tracking\/([^/?#\s]+)/i);
  if (trackingMatch) return trackingMatch[1].trim();

  return trimmed;
}
