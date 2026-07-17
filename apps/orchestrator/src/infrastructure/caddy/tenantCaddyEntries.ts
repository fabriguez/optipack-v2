/**
 * Construction CENTRALISEE des `TenantCaddyEntry` d'un VPS.
 *
 * Pourquoi centraliser : la region geree du Caddyfile est regeneree EN ENTIER
 * pour tous les tenants du VPS a chaque `applyForVps`. Le port public de chaque
 * tenant vaut `customSitePort ?? webClientPort ?? webPort` (cf. caddyfile.ts).
 * Si un appelant oublie de charger `TenantSite` / de renseigner `customSitePort`,
 * il REECRIT la route publique de TOUS les tenants du VPS vers le web-client par
 * defaut -- y compris ceux dont un site custom est `live`. C'est ce qui faisait
 * "revenir au site par defaut" sans manipulation (freeze/unfreeze/delete/purge/
 * migrate d'un tenant cassait le site custom de ses voisins).
 *
 * Toute reconciliation Caddy DOIT donc passer par ici pour preserver un site
 * custom live.
 */
import type { TenantStatus } from '../../../node_modules/.prisma/orchestrator-client';
import { prisma } from '../../config/database';
import type { TenantCaddyEntry } from './caddyfile';

/** Statuts de tenant qui doivent apparaitre dans la config Caddy. */
export const CADDY_TENANT_STATUSES: TenantStatus[] = ['ACTIVE', 'FROZEN', 'PROVISIONING'];

/** Forme minimale d'un tenant + son site pour construire une entree Caddy. */
type TenantWithSite = {
  slug: string;
  customDomain: string | null;
  apiPort: number | null;
  webPort: number | null;
  webClientPort: number | null;
  status: string;
  isMain?: boolean;
  site?: { status: string; sitePort: number | null } | null;
};

/**
 * Mappe un tenant (avec sa relation `site` chargee) vers une entree Caddy.
 * `customSitePort` n'est renseigne que si le site custom est `live` avec un port
 * -> il prend alors la main sur les hosts publics.
 */
export function toTenantCaddyEntry(
  t: TenantWithSite,
  freezeOverride?: { slug: string; isFrozen: boolean },
): TenantCaddyEntry {
  return {
    slug: t.slug,
    customDomain: t.customDomain,
    apiPort: t.apiPort!,
    webPort: t.webPort!,
    webClientPort: t.webClientPort ?? undefined,
    customSitePort:
      t.site && t.site.status === 'live' && t.site.sitePort ? t.site.sitePort : undefined,
    isFrozen:
      freezeOverride && freezeOverride.slug === t.slug
        ? freezeOverride.isFrozen
        : t.status === 'FROZEN',
    isMain: t.isMain ?? false,
  };
}

/**
 * Charge tous les tenants routables d'un VPS (avec leur site) et renvoie les
 * entrees Caddy pretes a passer a `applyForVps`. Les tenants sans apiPort/webPort
 * sont ecartes (pas encore provisionnes).
 */
export async function loadTenantCaddyEntries(
  vpsId: string,
  opts?: {
    freezeOverride?: { slug: string; isFrozen: boolean };
    /** Statuts supplementaires a inclure (ex: 'MIGRATING' pour une migration). */
    extraStatuses?: TenantStatus[];
  },
): Promise<TenantCaddyEntry[]> {
  const statuses: TenantStatus[] = [...CADDY_TENANT_STATUSES, ...(opts?.extraStatuses ?? [])];
  const tenants = await prisma.tenant.findMany({
    where: { vpsId, status: { in: statuses } },
    include: { site: true },
  });
  return tenants
    .filter((t) => t.apiPort && t.webPort)
    .map((t) => toTenantCaddyEntry(t as unknown as TenantWithSite, opts?.freezeOverride));
}
