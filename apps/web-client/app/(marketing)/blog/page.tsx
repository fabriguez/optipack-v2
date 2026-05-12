import type { Metadata } from 'next';
import { MarketingContentPage } from '@/components/marketing/MarketingContentPage';

export const metadata: Metadata = {
  title: 'Blog | Transit Soft Services',
  description: 'Actualites, retours de terrain et bonnes pratiques transit.',
};

export default function BlogPage() {
  return (
    <MarketingContentPage
      eyebrow="Blog"
      title="Bientot, des articles."
      intro="Nous preparons une serie de retours de terrain : comment les agences gerent leurs flux quotidiens, ce qui marche, ce qui coince, et ce que la plateforme apporte."
    >
      <h2>Au programme</h2>
      <ul>
        <li>Etudes de cas anonymes de transitaires partenaires.</li>
        <li>Guides pratiques : caisse, comptabilite, conteneurs.</li>
        <li>Changelog produit detaille mois par mois.</li>
        <li>Reflexions sur la logistique africaine.</li>
      </ul>

      <p className="mt-6">
        Premieres publications prevues debut 2026. Si vous voulez etre
        prevenu, inscrivez-vous a la newsletter via la page d&apos;accueil.
      </p>
    </MarketingContentPage>
  );
}
