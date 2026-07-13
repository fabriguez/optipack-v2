import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Les pages agences sont des client components ; la metadata vit dans ce layout serveur.
export const metadata: Metadata = {
  title: 'Nos agences',
  description: 'Trouvez l agence la plus proche : adresses, horaires d ouverture et coordonnees de toutes nos agences.',
};

export default function AgenciesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
