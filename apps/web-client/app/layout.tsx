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
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Transit Soft Services - Vos colis, suivis en temps reel',
  description:
    'Plateforme de suivi de colis multi-tenant. Suivez, déclarez et recevez vos envois avec une experience pensee pour vous.',
};

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
