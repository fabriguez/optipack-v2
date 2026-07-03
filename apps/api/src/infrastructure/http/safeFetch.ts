import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('safeFetch');

/**
 * Garde-fou SSRF pour tous les fetch d'URLs controlees par l'utilisateur
 * (logos tenant, images colis, pieces jointes...). Sans ce garde, un attaquant
 * peut pointer une URL "publique" vers un hote interne (169.254.169.254 =
 * metadata cloud, 127.0.0.1, minio:9000, etc.) ou faire un 302 vers ces hotes.
 *
 * Regles appliquees :
 *  - seuls http: et https: sont autorises ;
 *  - le hostname est resolu (toutes les IP) et rejete si l'une tombe dans une
 *    plage privee / reservee / loopback / link-local ;
 *  - les redirections sont suivies manuellement (max 3 sauts), chaque saut
 *    etant revalide contre les memes regles (le 302 est le principal bypass).
 */

const MAX_REDIRECTS = 3;
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024; // 25 Mo : garde-fou memoire optionnel.

/** Normalise une IP en minuscules sans zone (%eth0) pour la comparaison. */
function normalizeIp(ip: string): string {
  return ip.toLowerCase().split('%')[0];
}

/**
 * Vrai si l'IP (v4 ou v6) tombe dans une plage privee / reservee / loopback /
 * link-local. Couvre aussi les equivalents IPv6-mapped (::ffff:a.b.c.d) et
 * l'adresse metadata cloud 169.254.169.254.
 */
export function isPrivateIp(rawIp: string): boolean {
  const ip = normalizeIp(rawIp);
  const kind = isIP(ip);

  if (kind === 4) return isPrivateIpv4(ip);

  if (kind === 6) {
    // IPv4-mapped / -compatible : ::ffff:127.0.0.1, ::ffff:169.254.169.254...
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip) ?? /^::(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isPrivateIpv4(mapped[1]);

    if (ip === '::1' || ip === '::') return true; // loopback / unspecified
    if (ip.startsWith('fe8') || ip.startsWith('fe9') || ip.startsWith('fea') || ip.startsWith('feb')) {
      return true; // fe80::/10 link-local
    }
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // fc00::/7 unique-local
    return false;
  }

  // Pas une IP valide -> on ne peut pas garantir la surete : on rejette.
  return true;
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // 0.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. 169.254.169.254 metadata)
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT (reserved)
  return false;
}

/**
 * Valide qu'une URL est sure a fetcher : scheme http(s) et hote resolu vers une
 * IP publique uniquement. Leve une erreur explicite sinon. Reutilisable pour
 * pre-valider une URL avant de la stocker/passer plus loin.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`safeFetch: URL invalide (${rawUrl})`);
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`safeFetch: scheme non autorise (${parsed.protocol})`);
  }

  const host = parsed.hostname;

  // Hote litteral IP : on valide directement sans resolution DNS.
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new Error(`safeFetch: IP privee/reservee bloquee (${host})`);
    }
    return parsed;
  }

  // Hostname : on resout TOUTES les adresses et on rejette si une seule est privee.
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch (err) {
    throw new Error(`safeFetch: resolution DNS echouee pour ${host}`);
  }
  if (addresses.length === 0) {
    throw new Error(`safeFetch: aucune adresse resolue pour ${host}`);
  }
  for (const { address } of addresses) {
    if (isPrivateIp(address)) {
      throw new Error(`safeFetch: ${host} resout vers une IP privee/reservee (${address})`);
    }
  }
  return parsed;
}

/**
 * Lecture bornee du corps d'une reponse : coupe au-dela de MAX_RESPONSE_BYTES
 * pour eviter qu'une URL malveillante ne fasse exploser la memoire. Renvoie une
 * nouvelle Response equivalente (statut/headers preserves) au corps bufferise.
 */
async function capResponseBody(res: Response): Promise<Response> {
  if (!res.body) return res;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(`safeFetch: reponse trop volumineuse (> ${MAX_RESPONSE_BYTES} octets)`);
      }
      chunks.push(value);
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new Response(merged, {
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
  });
}

/**
 * fetch protege contre le SSRF. Meme signature que le fetch global mais :
 *  - valide chaque URL (scheme + IP resolue) via assertPublicUrl ;
 *  - suit les redirections manuellement (max 3), en revalidant chaque saut ;
 *  - borne la taille du corps.
 * Leve une erreur si l'URL (ou un saut de redirection) est bloquee, sinon se
 * comporte comme fetch. Les appelants gerent l'echec (log + skip) sans crasher.
 */
export async function safeFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  let currentUrl = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicUrl(currentUrl);

    const res = await fetch(currentUrl, { ...opts, redirect: 'manual' });

    // 3xx avec Location -> on revalide la cible avant de la suivre.
    const isRedirect = res.status >= 300 && res.status < 400;
    const location = res.headers.get('location');
    if (isRedirect && location) {
      if (hop === MAX_REDIRECTS) {
        throw new Error(`safeFetch: trop de redirections (> ${MAX_REDIRECTS})`);
      }
      // Location peut etre relative : on la resout contre l'URL courante.
      currentUrl = new URL(location, currentUrl).toString();
      // On draine le corps de la reponse de redirection pour liberer la socket.
      await res.body?.cancel().catch(() => {});
      continue;
    }

    return capResponseBody(res);
  }

  // Inatteignable (la boucle retourne ou throw), mais rassure le typecheck.
  throw new Error('safeFetch: boucle de redirection inattendue');
}

export { logger as safeFetchLogger };
