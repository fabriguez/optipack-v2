import type { Metadata } from 'next';
import Link from 'next/link';
import { MarketingContentPage } from '@/components/marketing/MarketingContentPage';

export const metadata: Metadata = {
  title: 'Documentation | Transit Soft Services',
  description: 'Guides et documentation utilisateur Transit Soft Services.',
};

const SECTIONS = [
  {
    title: 'Demarrer',
    items: [
      { label: 'Creation d\'un compte', desc: 'Inscription et activation du portail client.', href: '/register' },
      { label: 'Suivre un colis', desc: 'Utilisation de la page tracking publique.', href: '/track' },
      { label: 'Connexion', desc: 'Acceder a votre espace personnel.', href: '/login' },
    ],
  },
  {
    title: 'Pour les transitaires',
    items: [
      { label: 'Gestion des colis', desc: 'Creation, chargement, dechargement, livraison.', href: '#' },
      { label: 'Caisse et comptabilite', desc: 'Encaissements, decaissements, livre comptable.', href: '#' },
      { label: 'Conteneurs et bordereaux', desc: 'Cycle complet d\'un conteneur, bordereaux PDF.', href: '#' },
    ],
  },
  {
    title: 'API',
    items: [
      { label: 'Reference API publique', desc: 'Endpoints de tracking, format des reponses.', href: '/api-docs' },
    ],
  },
];

export default function DocsPage() {
  return (
    <MarketingContentPage
      eyebrow="Documentation"
      title="Tout ce qu'il faut pour bien commencer."
      intro="La documentation detaillee est en cours de redaction. Voici les guides essentiels deja disponibles."
    >
      <div className="not-prose mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2
              className="text-xl font-bold"
              style={{ color: 'var(--skin-foreground)' }}
            >
              {s.title}
            </h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {s.items.map((it) => (
                <Link
                  key={it.label}
                  href={it.href}
                  className="block rounded-2xl border p-4 transition-colors hover:bg-black/[.02]"
                  style={{ borderColor: 'var(--skin-border)' }}
                >
                  <p
                    className="text-sm font-semibold"
                    style={{ color: 'var(--skin-foreground)' }}
                  >
                    {it.label}
                  </p>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: 'var(--skin-muted)' }}
                  >
                    {it.desc}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </MarketingContentPage>
  );
}
