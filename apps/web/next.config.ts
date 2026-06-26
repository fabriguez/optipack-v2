import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  output: 'standalone',
  // @transitsoftservices/skins est consomme par lib/providers/TenantProvider.
  // En dev (sans dist/), Next/Turbopack a besoin de transpiler depuis les
  // sources TS -- d'ou la presence dans transpilePackages. En prod le
  // build cree dist/ via le Dockerfile, mais on garde le transpile comme
  // filet de securite (et pour eviter "Module not found" sur dev local).
  transpilePackages: [
    '@transitsoftservices/shared',
    '@transitsoftservices/ui',
    '@transitsoftservices/skins',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '9000',
      },
    ],
  },
  // NE PAS forcer de fallback localhost ici : un seul build Next est partage
  // entre tous les tenants et `env` est fige au build. Si on injectait
  // 'http://localhost:4000', `process.env.NEXT_PUBLIC_SOCKET_URL` serait
  // toujours defini cote client et masquerait la derivation runtime
  // (getApiOrigin -> api.<tenant>) dans SocketProvider/baseUrl. On n'inline
  // donc ces cles QUE si elles sont reellement fournies au build (override
  // explicite) ; sinon elles restent undefined et la derivation host prend le
  // relais.
  env: {
    ...(process.env.NEXT_PUBLIC_API_URL
      ? { NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL }
      : {}),
    ...(process.env.NEXT_PUBLIC_SOCKET_URL
      ? { NEXT_PUBLIC_SOCKET_URL: process.env.NEXT_PUBLIC_SOCKET_URL }
      : {}),
  },
  async headers() {
    return [
      {
        // Donnees pays / regions / villes : statiques, cache long
        source: '/locations/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
