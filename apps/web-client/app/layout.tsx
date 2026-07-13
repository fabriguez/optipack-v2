import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import { Toaster } from 'sonner';
import NextTopLoader from 'nextjs-toploader';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { QueryProvider } from '@/lib/providers/QueryProvider';
import { SkinProvider } from '@/lib/providers/SkinProvider';
import { TenantMetaProvider } from '@/lib/providers/TenantMetaProvider';
import { DynamicFavicon } from '@/components/DynamicFavicon';
import { cn } from '@/lib/utils';
import { getBaseUrl, getTenantMeta, DEFAULT_DESCRIPTION } from '@/lib/seo';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

/**
 * Metadata tenant-aware resolue cote serveur : titre, description, OG et
 * canonical portent le nom du tenant (un domaine par tenant). Le crawl
 * (Google comme bots AI) voit donc la bonne marque sans executer de JS.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [meta, baseUrl] = await Promise.all([getTenantMeta(), getBaseUrl()]);
  const name = meta.name?.trim() || 'Transit Soft Services';
  const title = `${name} - Suivi de colis en temps reel`;
  const ogImage = meta.logoUrl?.startsWith('http') ? meta.logoUrl : `${baseUrl}/preview-dashboard.png`;

  return {
    metadataBase: new URL(baseUrl),
    title: { default: title, template: `%s | ${name}` },
    description: DEFAULT_DESCRIPTION,
    applicationName: name,
    alternates: { canonical: './' },
    robots: { index: true, follow: true },
    openGraph: {
      type: 'website',
      siteName: name,
      title,
      description: DEFAULT_DESCRIPTION,
      url: baseUrl,
      locale: 'fr_FR',
      images: [{ url: ogImage, alt: name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: DEFAULT_DESCRIPTION,
      images: [ogImage],
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={cn('skin-font-body', geist.variable)}>
      <body>
        <NextTopLoader
          color="var(--skin-primary)"
          height={3}
          showSpinner={false}
          shadow="0 0 12px var(--skin-glow)"
        />
        <NuqsAdapter>
          <QueryProvider>
            <TenantMetaProvider>
              <DynamicFavicon />
              <SkinProvider>{children}</SkinProvider>
            </TenantMetaProvider>
          </QueryProvider>
        </NuqsAdapter>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
