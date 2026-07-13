import { headers } from 'next/headers';

/**
 * Helpers SEO server-side. Le site est multi-tenant (un domaine par tenant),
 * donc les metadata, le sitemap, robots.txt et llms.txt sont derives du host
 * de la requete + du tenant-meta expose par l'API.
 *
 * Cote serveur on passe par INTERNAL_API_URL (reseau docker) quand present,
 * sinon NEXT_PUBLIC_API_URL (dev local).
 */

const SERVER_API_URL =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:4000/api/v1';

export interface PublicTenantMeta {
  id: string;
  slug: string | null;
  name: string;
  logoUrl: string | null;
  supportEmail: string | null;
  defaultLanguage: string;
  isMain?: boolean;
  mobileAppConfig?: {
    appName?: string;
    storeLinks?: { ios?: string; android?: string };
  } | null;
}

export const FALLBACK_TENANT: PublicTenantMeta = {
  id: 'fallback',
  slug: null,
  name: 'Transit Soft Services',
  logoUrl: null,
  supportEmail: null,
  defaultLanguage: 'fr',
};

export const DEFAULT_DESCRIPTION =
  'Plateforme de gestion et de suivi de colis : suivi en temps reel, simulation de tarifs, ' +
  'paiement en ligne et notifications automatiques, sur le web et sur mobile.';

/** Base URL publique de la requete courante (https://<host>). */
export async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3001';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

/** Slug tenant deduit du host (acme.domaine.com -> acme), sinon null. */
function slugFromHost(host: string): string | null {
  const parts = host.split(':')[0].split('.');
  return parts.length >= 3 ? parts[0] : null;
}

/**
 * Tenant-meta cote serveur, avec cache court (5 min). L'API resout le tenant
 * via X-Tenant-Slug, puis fallback premiere org (deploiements single-tenant).
 */
export async function getTenantMeta(): Promise<PublicTenantMeta> {
  try {
    const h = await headers();
    const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
    const slug = slugFromHost(host);
    const res = await fetch(`${SERVER_API_URL}/tenant-meta`, {
      headers: slug ? { 'X-Tenant-Slug': slug } : undefined,
      next: { revalidate: 300 },
    });
    if (!res.ok) return FALLBACK_TENANT;
    const json = (await res.json()) as { data?: PublicTenantMeta };
    return json.data ?? FALLBACK_TENANT;
  } catch {
    return FALLBACK_TENANT;
  }
}

/** Pages marketing publiques, utilisees par sitemap.ts et llms.txt. */
export const PUBLIC_PAGES: { path: string; title: string; description: string }[] = [
  { path: '/', title: 'Accueil', description: 'Presentation du service de suivi et de gestion de colis.' },
  { path: '/track', title: 'Suivre un colis', description: 'Suivi en temps reel d un colis a partir de son numero de reference.' },
  { path: '/simulateur', title: 'Simulateur de tarifs', description: 'Estimation instantanee du cout d un envoi selon poids, volume et destination.' },
  { path: '/agencies', title: 'Agences', description: 'Liste des agences, adresses et horaires.' },
  { path: '/about', title: 'A propos', description: 'Qui nous sommes et notre mission.' },
  { path: '/support', title: 'Support', description: 'Aide et questions frequentes.' },
  { path: '/docs', title: 'Documentation', description: 'Guides d utilisation de la plateforme.' },
  { path: '/api-docs', title: 'API', description: 'Documentation de l API publique.' },
  { path: '/blog', title: 'Blog', description: 'Actualites et conseils logistique.' },
  { path: '/team', title: 'Equipe', description: 'L equipe derriere la plateforme.' },
  { path: '/careers', title: 'Carrieres', description: 'Postes ouverts.' },
  { path: '/press', title: 'Presse', description: 'Ressources presse.' },
  { path: '/status', title: 'Statut du service', description: 'Disponibilite de la plateforme en temps reel.' },
  { path: '/cgv', title: 'CGV', description: 'Conditions generales de vente.' },
  { path: '/privacy', title: 'Confidentialite', description: 'Politique de confidentialite.' },
  { path: '/cookies', title: 'Cookies', description: 'Politique cookies.' },
  { path: '/legal', title: 'Mentions legales', description: 'Mentions legales.' },
];
