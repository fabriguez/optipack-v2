import './globals.css';
import { QueryProvider } from '@/components/QueryProvider';

export const metadata = {
  title: 'TransitSoft Ops Admin',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
