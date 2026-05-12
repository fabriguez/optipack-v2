import type { Metadata } from 'next';
import { LegalPage } from '@/components/marketing/LegalPage';

export const metadata: Metadata = {
  title: 'Politique cookies | Transit Soft Services',
  description: 'Quels cookies utilisons-nous et pourquoi.',
};

export default function CookiesPage() {
  return (
    <LegalPage title="Politique cookies" lastUpdated="12 mai 2026">
      <p>
        Cette page detaille les cookies et technologies similaires utilises
        par Transit Soft Services. Nous limitons l&apos;usage aux cookies strictement
        necessaires au fonctionnement du service.
      </p>

      <h2>1. Cookies essentiels</h2>
      <ul>
        <li>
          <code>session_token</code> : authentification (JWT 7 jours).
          Indispensable pour acceder a votre espace client.
        </li>
        <li>
          <code>skin_preference</code> : votre choix de theme visuel,
          conserve 6 mois.
        </li>
        <li>
          <code>csrf_token</code> : protection contre les attaques CSRF
          (session uniquement).
        </li>
      </ul>

      <h2>2. Cookies analytiques</h2>
      <p>
        Transit Soft Services n&apos;utilise actuellement aucun cookie d&apos;analyse tiers
        (Google Analytics, Facebook Pixel, etc.). Si cela change, vous serez
        notifie et un bandeau de consentement apparaitra.
      </p>

      <h2>3. Gestion des cookies</h2>
      <p>
        Vous pouvez bloquer ou supprimer les cookies via les parametres de
        votre navigateur. La desactivation des cookies essentiels rendra
        impossible la connexion au portail.
      </p>
    </LegalPage>
  );
}
