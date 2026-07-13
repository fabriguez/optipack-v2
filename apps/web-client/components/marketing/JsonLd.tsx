import { getBaseUrl, getTenantMeta, DEFAULT_DESCRIPTION } from '@/lib/seo';

/**
 * Donnees structurees schema.org rendues cote serveur (HTML brut, donc
 * visibles des crawlers Google et AI sans execution JS) :
 * - Organization : entite du tenant (nom, logo, contact)
 * - WebSite + SearchAction : le suivi de colis comme action de recherche
 * - MobileApplication : l'app mobile, avec liens stores si configures
 */
export async function JsonLd() {
  const [meta, baseUrl] = await Promise.all([getTenantMeta(), getBaseUrl()]);
  const name = meta.name?.trim() || 'Transit Soft Services';
  const logo = meta.logoUrl?.startsWith('http') ? meta.logoUrl : `${baseUrl}/logo.png`;
  const storeLinks = meta.mobileAppConfig?.storeLinks;
  const appName = meta.mobileAppConfig?.appName?.trim() || name;

  const organization = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name,
    url: baseUrl,
    logo,
    description: DEFAULT_DESCRIPTION,
    ...(meta.supportEmail
      ? {
          contactPoint: {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: meta.supportEmail,
          },
        }
      : {}),
  };

  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: baseUrl,
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${baseUrl}/track?code={tracking_code}`,
      },
      'query-input': 'required name=tracking_code',
    },
  };

  const mobileApp = {
    '@context': 'https://schema.org',
    '@type': 'MobileApplication',
    name: appName,
    operatingSystem: 'iOS, Android',
    applicationCategory: 'BusinessApplication',
    description: `Application mobile ${appName} : suivi de colis en temps reel, notifications de livraison et paiement en ligne.`,
    ...(storeLinks?.ios || storeLinks?.android
      ? { installUrl: [storeLinks?.ios, storeLinks?.android].filter(Boolean) }
      : {}),
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };

  const blocks = [organization, website, mobileApp];

  return (
    <>
      {blocks.map((b, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(b) }}
        />
      ))}
    </>
  );
}
