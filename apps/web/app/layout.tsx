import type { Metadata } from 'next';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { SessionProvider } from '@/lib/providers/SessionProvider';
import { QueryProvider } from '@/lib/providers/QueryProvider';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { AppToaster } from '@/components/ui/AppToast';
import './globals.css';
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'TransitSoftServices - Gestion de Transit',
  description: 'Application de gestion de transit aerien, maritime et terrestre',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={cn("font-sans", geist.variable)}>
      <body>
        <NuqsAdapter>
          <SessionProvider>
            <QueryProvider>
              <NextIntlClientProvider messages={messages}>
                {children}
              </NextIntlClientProvider>
              <AppToaster />
            </QueryProvider>
          </SessionProvider>
        </NuqsAdapter>
      </body>
    </html>
  );
}
