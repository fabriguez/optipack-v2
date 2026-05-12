import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContentPage } from '@/components/marketing/MarketingContentPage';

export const metadata: Metadata = {
  title: 'Carrieres | Transit Soft Services',
  description: 'Rejoignez l\'equipe Transit Soft Services.',
};

export default function CareersPage() {
  return (
    <MarketingContentPage
      eyebrow="Carrieres"
      title="Construisons les outils du transit africain."
      intro="Nous recrutons rarement, mais quand nous le faisons, nous cherchons des profils qui aiment la qualite et le terrain."
    >
      <h2>Ce que nous offrons</h2>
      <ul>
        <li>Une mission concrete avec un impact direct sur des PME africaines.</li>
        <li>Un cadre de travail flexible, mix remote / presentiel a Yaounde.</li>
        <li>Une remuneration fixe + variable indexee sur la satisfaction client.</li>
        <li>De vraies responsabilites des le premier jour.</li>
      </ul>

      <h2>Postes ouverts</h2>
      <p>
        Aucun poste actif en ce moment. Nous gardons cette page a jour des
        qu&apos;une opportunite s&apos;ouvre. Vous pouvez nous envoyer une
        candidature spontanee a{' '}
        <Link
          href="mailto:careers@transitsoftservices.com"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          careers@transitsoftservices.com
        </Link>
        .
      </p>

      <h2>Stages et alternances</h2>
      <p>
        Nous accueillons regulierement des stagiaires en developpement,
        design produit et support client. Postulez en precisant la duree
        souhaitee et vos disponibilites.
      </p>
    </MarketingContentPage>
  );
}
