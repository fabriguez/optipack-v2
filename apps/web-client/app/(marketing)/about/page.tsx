import type { Metadata } from 'next';
import { MarketingContentPage } from '@/components/marketing/MarketingContentPage';

export const metadata: Metadata = {
  title: 'A propos | Transit Soft Services',
  description: 'Notre mission : simplifier le transit de colis en Afrique.',
};

export default function AboutPage() {
  return (
    <MarketingContentPage
      eyebrow="A propos"
      title="Une plateforme pensee pour les transitaires d'Afrique."
      intro="Transit Soft Services est ne du constat que la gestion logistique en Afrique de l'Ouest et Centrale meritait des outils a la hauteur des entreprises qui la pratiquent."
    >
      <h2>Notre mission</h2>
      <p>
        Apporter aux transitaires un outil complet, fiable et abordable pour
        gerer leurs colis, leurs clients, leur facturation et leur comptabilite,
        sans dependre de logiciels conçus pour d&apos;autres marches.
      </p>

      <h2>Notre histoire</h2>
      <p>
        Lancee en 2025 a Yaounde, la plateforme est le fruit d&apos;une
        collaboration etroite entre developpeurs et transitaires de terrain.
        Chaque fonctionnalite a ete validee sur le flux reel de plusieurs
        agences avant d&apos;etre generalisee.
      </p>

      <h2>Ce qui nous guide</h2>
      <ul>
        <li><strong>Fiabilite</strong> : la comptabilite est immuable, les paiements traces, les bordereaux reproductibles.</li>
        <li><strong>Simplicite</strong> : nos interfaces sont utilisees au quotidien par des agents qui ne sont pas informaticiens.</li>
        <li><strong>Souverainete</strong> : vos donnees vous appartiennent. Export complet a tout moment.</li>
        <li><strong>Adaptation locale</strong> : devises XAF, modes de paiement Mobile Money, integration WhatsApp natifs.</li>
      </ul>
    </MarketingContentPage>
  );
}
