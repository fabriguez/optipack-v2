import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// La page est un client component ; la metadata vit dans ce layout serveur.
export const metadata: Metadata = {
  title: 'Suivre un colis',
  description:
    'Suivez votre colis en temps reel : entrez votre numero de reference et consultez le statut, la position et l historique de votre envoi.',
};

export default function TrackLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
