import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// La page promotions est un client component ; la metadata vit dans ce layout serveur.
export const metadata: Metadata = {
  title: 'Codes promo',
  description:
    'Tous les codes promo en cours : reductions sur vos envois, conditions d utilisation et dates de validite.',
};

export default function PromotionsLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
