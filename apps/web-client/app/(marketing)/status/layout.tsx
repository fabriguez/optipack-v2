import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// La page est un client component ; la metadata vit dans ce layout serveur.
export const metadata: Metadata = {
  title: 'Statut du service',
  description: 'Disponibilite en temps reel de la plateforme et de ses services : API, suivi, paiements et notifications.',
};

export default function StatusLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
