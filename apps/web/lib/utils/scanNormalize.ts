/**
 * Normalise une valeur scannee (QR / code-barres) pour en extraire le tracking
 * number reel.
 *
 * Cas couverts :
 *   - URL de suivi : "https://app.transitsoftservices.com/tracking/TST-ABC"
 *     -> "TST-ABC"
 *   - URL avec hash/query : "https://.../tracking/TST-ABC?foo=bar#x"
 *     -> "TST-ABC"
 *   - Valeur brute : "TST-ABC" -> "TST-ABC"
 *   - Whitespace / line break ajoute par le scanner : trimme
 *   - Cas null / undefined : retourne ''
 *
 * Le bug initial : les QR des colis encodent l'URL complete (pour permettre
 * un suivi public en scannant). Les consommateurs metier (chargement,
 * dechargement, inventaire, ...) ont besoin du tracking number sec. Cette
 * fonction fait le pont sans changer la generation du QR.
 */
export function normalizeScannedTracking(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';

  // Tente de detecter une URL et d'extraire la portion apres "/tracking/".
  const trackingMatch = trimmed.match(/\/tracking\/([^/?#\s]+)/i);
  if (trackingMatch) return trackingMatch[1].trim();

  // Si la valeur ressemble a une URL absolue mais sans le chemin attendu, on
  // prend le dernier segment du path comme heuristique.
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const u = new URL(trimmed);
      const segs = u.pathname.split('/').filter(Boolean);
      const last = segs[segs.length - 1];
      if (last) return last.trim();
    }
  } catch {
    // Pas une URL valide -> on retombe sur la valeur trimmee.
  }

  return trimmed;
}
