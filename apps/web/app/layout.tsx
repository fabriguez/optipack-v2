import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { SessionProvider } from '@/lib/providers/SessionProvider';
import { QueryProvider } from '@/lib/providers/QueryProvider';
import { TenantProvider } from '@/lib/providers/TenantProvider';
import { DynamicFavicon } from '@/components/layout/DynamicFavicon';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { AppToaster } from '@/components/ui/AppToast';
import NextTopLoader from 'nextjs-toploader';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

// Titre placeholder cote serveur. Le vrai titre est override cote client
// par TenantProvider.applyTheme(meta.name) une fois la meta tenant chargee.
export const metadata: Metadata = {
  title: 'Chargement...',
  description: 'Application de gestion de transit aerien, maritime et terrestre',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={cn("font-sans", geist.variable)}>
      <body>
        <NextTopLoader
          color="#4CAF50"
          height={3}
          showSpinner={false}
          shadow="0 0 8px #4CAF50, 0 0 4px #4CAF50"
          easing="ease"
          speed={250}
        />
        <NuqsAdapter>
          <SessionProvider>
            <QueryProvider>
              <TenantProvider>
                <DynamicFavicon />
                <NextIntlClientProvider messages={messages}>
                  {children}
                </NextIntlClientProvider>
                <AppToaster />
              </TenantProvider>
            </QueryProvider>
          </SessionProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
