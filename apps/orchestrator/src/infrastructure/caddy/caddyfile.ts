/**
 * Generation + merge de la config Caddy au format **Caddyfile texte**.
 *
 * Strategie retenue (cf. docs/caddy-reconcile.md) :
 *   - Le `/etc/caddy/Caddyfile` (self) ou `~/.optipack/caddy/Caddyfile` (VPS
 *     conteneur) reste la SOURCE DE VERITE sur disque -> survit au restart de
 *     Caddy (systemd/conteneur relit le fichier au boot).
 *   - L'orchestrateur ne regenere QUE la region delimitee par les marqueurs
 *     `OPTIPACK-MANAGED`. Tout ce qui est hors marqueurs (bloc global `admin`,
 *     routes ajoutees a la main comme whatsapp / s3 / storage / domaines perso)
 *     est PRESERVE verbatim.
 *   - En plus des marqueurs, on retire tout bloc top-level dont l'adresse est
 *     desormais geree (evite les doublons d'adresse quand un host geré etait
 *     ecrit a la main avant migration).
 *
 * Le merge se fait sur le TEXTE (pas le JSON admin API) precisement pour
 * conserver les directives riches des blocs manuels (encode, header, redir,
 * cache) telles quelles.
 */

/** Un tenant tel que Caddy doit le router. */
export interface TenantCaddyEntry {
  slug: string;
  customDomain?: string | null;
  apiPort: number;
  webPort: number;
  /** Port du conteneur web-client (site public + portail). Optionnel pour
   *  retrocompatibilite avec les tenants pre-Phase web-client. */
  webClientPort?: number;
  isFrozen: boolean;
  /** Tenant principal : schema d'URL plat (app/api/apex/www.{base}) au lieu
   *  du pattern slug habituel. */
  isMain?: boolean;
}

export interface BuildOptions {
  /** ex: "transitsoftservices.com" */
  baseDomain: string;
  /** Email ACME. Optionnel : Caddy emet des certs sans compte email. Conserve
   *  pour compat avec les appelants historiques (buildConfig JSON). */
  email?: string;
}

export interface StaticRoute {
  host: string;
  upstream: string;
}

/** Marqueurs de la region geree. On matche sur le PREFIXE pour rester tolerant
 *  a une eventuelle evolution du texte apres les deux-chevrons. */
export const MANAGED_BEGIN_PREFIX = '# >>> OPTIPACK-MANAGED:BEGIN';
export const MANAGED_END_PREFIX = '# <<< OPTIPACK-MANAGED:END';
const MANAGED_BEGIN = `${MANAGED_BEGIN_PREFIX} (genere par l'orchestrateur — NE PAS EDITER, regenere a chaque reconcile) >>>`;
const MANAGED_END = `${MANAGED_END_PREFIX} <<<`;

const FROZEN_BODY =
  '<h1>Service suspendu</h1><p>Votre abonnement a expire. Contactez le support.</p>';

/** Hosts servis par un tenant, selon qu'il est principal ou non. */
interface TenantHosts {
  publicHosts: string[];
  staffHosts: string[];
  apiHost: string;
}

function hostsFor(t: TenantCaddyEntry, baseDomain: string): TenantHosts {
  const publicHosts = t.isMain
    ? [baseDomain, `www.${baseDomain}`]
    : [`${t.slug}.${baseDomain}`, `www.${t.slug}.${baseDomain}`];
  if (t.customDomain) publicHosts.push(t.customDomain);

  const staffHosts = t.isMain ? [`app.${baseDomain}`] : [`app.${t.slug}.${baseDomain}`];
  const apiHost = t.isMain ? `api.${baseDomain}` : `api.${t.slug}.${baseDomain}`;
  return { publicHosts, staffHosts, apiHost };
}

/** Routes statiques additionnelles (ops-admin, orchestrator API, whatsapp...).
 *  Format env :  CADDY_STATIC_ROUTES="host1=127.0.0.1:port1,host2=..."
 *  Si l'env est set il REMPLACE le defaut (donc re-inclure ops/ops-admin). */
export function parseStaticRoutes(baseDomain: string): StaticRoute[] {
  const staticDefault = [
    `ops.${baseDomain}=127.0.0.1:4020`,
    `ops-admin.${baseDomain}=127.0.0.1:3020`,
  ].join(',');
  // Empty/whitespace (ex: compose `${VAR:-}` non defini) => on retombe sur le
  // defaut, sinon ops/ops-admin disparaitraient de la region geree.
  const env = process.env.CADDY_STATIC_ROUTES;
  const raw = env && env.trim() ? env : staticDefault;
  const out: StaticRoute[] = [];
  for (const entry of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const host = entry.slice(0, eq).trim();
    const upstream = entry.slice(eq + 1).trim();
    if (host && upstream) out.push({ host, upstream });
  }
  return out;
}

/** Ensemble des hosts que la region geree definit -> sert a retirer les blocs
 *  manuels devenus doublons lors du merge. */
export function collectManagedHosts(
  entries: TenantCaddyEntry[],
  baseDomain: string,
  statics: StaticRoute[],
): Set<string> {
  const s = new Set<string>();
  for (const t of entries) {
    const h = hostsFor(t, baseDomain);
    for (const host of [...h.publicHosts, ...h.staffHosts, h.apiHost]) s.add(host);
  }
  for (const r of statics) s.add(r.host);
  return s;
}

function siteBlock(hosts: string[], body: string): string {
  return `${hosts.join(', ')} {\n${body}\n}`;
}

type XFrame = 'DENY' | 'SAMEORIGIN';

/** reverse_proxy + gzip + headers securite (aligne sur le durcissement manuel
 *  du Caddyfile self : nosniff / X-Frame-Options / Referrer-Policy). */
function proxyBody(upstream: string, xFrame: XFrame = 'SAMEORIGIN'): string {
  return [
    `\tencode gzip`,
    `\treverse_proxy ${upstream}`,
    `\theader {`,
    `\t\tX-Content-Type-Options nosniff`,
    `\t\tX-Frame-Options ${xFrame}`,
    `\t\tReferrer-Policy strict-origin-when-cross-origin`,
    `\t}`,
  ].join('\n');
}

function frozenBody(): string {
  // Backtick = token multi-ligne Caddyfile ; le body n'a pas de backtick.
  return `\theader Content-Type "text/html; charset=utf-8"\n\trespond \`${FROZEN_BODY}\` 503`;
}

/**
 * Rend la region geree complete (marqueurs inclus) pour la liste de tenants +
 * routes statiques donnee. `at` horodate le commentaire (pas de Date interne
 * pour rester testable/deterministe).
 */
export function renderManagedRegion(
  entries: TenantCaddyEntry[],
  opts: BuildOptions,
  statics: StaticRoute[],
  at: Date,
): string {
  const blocks: string[] = [];

  for (const t of entries) {
    const h = hostsFor(t, opts.baseDomain);
    if (t.isFrozen) {
      blocks.push(siteBlock(h.staffHosts, frozenBody()));
      blocks.push(siteBlock(h.publicHosts, frozenBody()));
      blocks.push(siteBlock([h.apiHost], frozenBody()));
      continue;
    }
    // Staff dashboard
    blocks.push(siteBlock(h.staffHosts, proxyBody(`127.0.0.1:${t.webPort}`, 'SAMEORIGIN')));
    // Public site + portail (fallback sur le web staff si pas de web-client)
    const publicUpstream = t.webClientPort
      ? `127.0.0.1:${t.webClientPort}`
      : `127.0.0.1:${t.webPort}`;
    blocks.push(siteBlock(h.publicHosts, proxyBody(publicUpstream, 'SAMEORIGIN')));
    // API : X-Frame-Options DENY (jamais embarquee en iframe)
    blocks.push(siteBlock([h.apiHost], proxyBody(`127.0.0.1:${t.apiPort}`, 'DENY')));
  }

  for (const r of statics) {
    // ops.* = backend/admin -> DENY ; le reste (ops-admin, s3...) -> SAMEORIGIN.
    const xFrame: XFrame = r.host.startsWith('ops.') || r.host.startsWith('api.') ? 'DENY' : 'SAMEORIGIN';
    blocks.push(siteBlock([r.host], proxyBody(r.upstream, xFrame)));
  }

  const stamp = at.toISOString();
  const header =
    `${MANAGED_BEGIN}\n` +
    `# genere: ${stamp} — ${entries.length} tenant(s), ${statics.length} route(s) interne(s).`;
  const body = blocks.length ? blocks.join('\n\n') : '# (aucun tenant/route a servir)';
  return `${header}\n${body}\n${MANAGED_END}`;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Fusionne la region geree dans un Caddyfile existant :
 *  1. retire l'ancienne region geree (entre marqueurs)
 *  2. retire les blocs top-level dont l'adresse est desormais geree (doublons)
 *  3. re-ajoute la region geree fraiche a la fin
 *
 * Tout le reste (bloc global, blocs manuels) est conserve verbatim.
 */
export function mergeManagedRegion(
  existing: string,
  region: string,
  managedHosts: Set<string>,
): string {
  const withoutRegion = stripManagedRegion(existing);
  const cleaned = dropManagedBlocks(withoutRegion, managedHosts);
  // Collapse les series de lignes vides laissees par les blocs retires.
  const base = cleaned.replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
  return base.length ? `${base}\n\n${region}\n` : `${region}\n`;
}

/** Supprime les lignes de MANAGED_BEGIN a MANAGED_END (incluses). */
function stripManagedRegion(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    const t = line.trim();
    if (!inside && t.startsWith(MANAGED_BEGIN_PREFIX)) {
      inside = true;
      continue;
    }
    if (inside) {
      if (t.startsWith(MANAGED_END_PREFIX)) inside = false;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}

interface Item {
  type: 'raw' | 'block';
  text: string;
  /** adresses top-level du bloc (vide pour un bloc global sans adresse). */
  address: string[];
}

/** Retire les blocs dont TOUTES les adresses sont gerees (doublons a purger). */
function dropManagedBlocks(text: string, managed: Set<string>): string {
  const items = splitTopLevel(text);
  const kept = items.filter((it) => {
    if (it.type !== 'block' || it.address.length === 0) return true;
    return !it.address.every((a) => managed.has(stripAddr(a)));
  });
  return kept.map((it) => it.text).join('\n');
}

function stripAddr(a: string): string {
  return a.replace(/^https?:\/\//, '').replace(/:\d+$/, '');
}

/**
 * Decoupe un Caddyfile en items top-level (blocs + lignes brutes).
 * Parser tolerant, base sur la profondeur d'accolades en ignorant :
 *   - les placeholders Caddy `{uri}`, `{http.request.host}` (pas d'espace)
 *   - les commentaires `#`
 *   - le contenu entre guillemets/backticks
 * Suffisant pour des Caddyfiles standards (le notre + blocs manuels usuels).
 */
function splitTopLevel(text: string): Item[] {
  const lines = text.split('\n');
  const items: Item[] = [];
  let depth = 0;
  let buf: string[] = [];
  let header = '';

  for (const line of lines) {
    if (depth === 0) {
      const t = line.trim();
      if (t === '' || t.startsWith('#')) {
        items.push({ type: 'raw', text: line, address: [] });
        continue;
      }
      buf = [line];
      const d = braceDelta(line);
      depth += d;
      header = headerOf(line);
      if (depth <= 0) {
        // bloc une ligne (ouvre+ferme) OU directive sans accolade
        if (d > 0 || line.includes('{')) {
          items.push({ type: 'block', text: buf.join('\n'), address: parseAddr(header) });
        } else {
          items.push({ type: 'raw', text: line, address: [] });
        }
        depth = 0;
        buf = [];
        header = '';
      }
    } else {
      buf.push(line);
      depth += braceDelta(line);
      if (depth <= 0) {
        items.push({ type: 'block', text: buf.join('\n'), address: parseAddr(header) });
        depth = 0;
        buf = [];
        header = '';
      }
    }
  }
  // accolades non equilibrees : on garde le reste tel quel (best-effort)
  if (buf.length) items.push({ type: 'raw', text: buf.join('\n'), address: [] });
  return items;
}

function braceDelta(line: string): number {
  let s = line;
  const hash = findCommentStart(s);
  if (hash >= 0) s = s.slice(0, hash);
  s = s.replace(/\{[^{}\s]*\}/g, ''); // enleve les placeholders {uri}, {http...}
  let d = 0;
  for (const ch of s) {
    if (ch === '{') d++;
    else if (ch === '}') d--;
  }
  return d;
}

function findCommentStart(s: string): number {
  let inS = false;
  let inD = false;
  let inB = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '`' && !inS && !inD) inB = !inB;
    else if (c === "'" && !inD && !inB) inS = !inS;
    else if (c === '"' && !inS && !inB) inD = !inD;
    else if (c === '#' && !inS && !inD && !inB) {
      if (i === 0 || /\s/.test(s[i - 1])) return i;
    }
  }
  return -1;
}

function headerOf(line: string): string {
  const i = line.indexOf('{');
  return (i >= 0 ? line.slice(0, i) : line).trim();
}

function parseAddr(header: string): string[] {
  return header
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
