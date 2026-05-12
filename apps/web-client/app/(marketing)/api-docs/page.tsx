import type { Metadata } from 'next';
import { MarketingContentPage } from '@/components/marketing/MarketingContentPage';

export const metadata: Metadata = {
  title: 'API | Transit Soft Services',
  description: 'Reference de l\'API publique Transit Soft Services.',
};

export default function ApiDocsPage() {
  return (
    <MarketingContentPage
      eyebrow="API"
      title="Reference API publique."
      intro="Les endpoints publics permettent a vos integrations de suivre les colis et de recuperer les informations non sensibles."
    >
      <h2>Base URL</h2>
      <p>
        Tous les endpoints publics sont accessibles a la racine{' '}
        <code className="rounded bg-black/5 px-1.5 py-0.5 text-sm">https://api.transitsoftservices.com/api/v1/public</code>.
        Aucune authentification requise.
      </p>

      <h2>GET /tracking/:trackingNumber</h2>
      <p>
        Retourne les informations publiques d&apos;un colis : statut, destination,
        magasin actuel, dates cle.
      </p>
      <p><strong>Reponse 200 :</strong></p>
      <pre className="overflow-x-auto rounded-xl bg-black/5 p-4 text-xs">
{`{
  "success": true,
  "data": {
    "trackingNumber": "TST-AB12CD",
    "designation": "Vetements - 3 cartons",
    "status": "IN_TRANSIT",
    "isPresent": false,
    "destination": "Douala",
    "createdAt": "2026-05-12T10:00:00.000Z",
    "warehouse": { "name": "Yaounde Centre", "agency": { "name": "Yaounde", "city": "Yaounde" } },
    "destinationAgency": { "name": "Douala", "city": "Douala" },
    "transitRoute": { "name": "YDE-DLA", "type": "LAND" }
  }
}`}
      </pre>

      <h2>Codes de retour</h2>
      <ul>
        <li><code>200</code> : colis trouve.</li>
        <li><code>404</code> : aucun colis pour ce tracking.</li>
        <li><code>400</code> : parametre manquant.</li>
      </ul>

      <h2>API privee</h2>
      <p>
        L&apos;API privee (gestion colis, comptabilite, caisse) est accessible
        aux agences partenaires via un JWT. Contactez-nous pour acceder a la
        documentation complete et obtenir vos credentials.
      </p>
    </MarketingContentPage>
  );
}
