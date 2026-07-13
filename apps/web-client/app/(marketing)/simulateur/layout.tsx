import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// La page est un client component ; la metadata vit dans ce layout serveur.
export const metadata: Metadata = {
  title: 'Simulateur de tarifs',
  description:
    'Estimez instantanement le cout de votre envoi de colis selon le poids, le volume et la destination. Simulation gratuite et sans engagement.',
};

export default function SimulateurLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
