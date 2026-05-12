import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContentPage } from '@/components/marketing/MarketingContentPage';

export const metadata: Metadata = {
  title: 'Presse | Transit Soft Services',
  description: 'Espace presse de Transit Soft Services.',
};

export default function PressPage() {
  return (
    <MarketingContentPage
      eyebrow="Presse"
      title="Espace presse."
      intro="Vous etes journaliste, bloggeur ou createur de contenu ? Voici nos ressources."
    >
      <h2>Contact presse</h2>
      <p>
        Pour toute demande d&apos;interview, de chiffres ou de visuels :{' '}
        <Link
          href="mailto:press@transitsoftservices.com"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          press@transitsoftservices.com
        </Link>
        . Reponse sous 48 heures ouvrees.
      </p>

      <h2>Kit de marque</h2>
      <p>
        Logos, palettes et captures haute resolution disponibles sur demande
        par email. Merci de mentionner le contexte d&apos;utilisation prevu.
      </p>

      <h2>Faits cles</h2>
      <ul>
        <li>Fondee en 2025 a Yaounde, Cameroun.</li>
        <li>Plateforme SaaS multi-tenant pour transitaires d&apos;Afrique
          de l&apos;Ouest et Centrale.</li>
        <li>Conforme aux normes OHADA pour la comptabilite.</li>
        <li>Disponible en français, support en cours pour anglais.</li>
      </ul>
    </MarketingContentPage>
  );
}
