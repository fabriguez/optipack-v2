import type { Metadata } from 'next';
import { MarketingContentPage } from '@/components/marketing/MarketingContentPage';

export const metadata: Metadata = {
  title: 'Equipe | Transit Soft Services',
  description: "L'equipe derriere Transit Soft Services.",
};

const TEAM = [
  {
    name: 'Equipe technique',
    role: 'Ingenierie produit',
    desc: "Conçoit la plateforme avec un parti pris : la qualite de code n'est pas optionnelle, l'audit est continu.",
  },
  {
    name: 'Equipe support',
    role: 'Reussite client',
    desc: 'Accompagne les agences a chaque etape : configuration, formation des operateurs, suivi des incidents.',
  },
  {
    name: 'Equipe operations',
    role: 'Operations & finance',
    desc: "Veille a ce que les flux de paiement, la facturation et la comptabilite soient conformes aux normes OHADA.",
  },
];

export default function TeamPage() {
  return (
    <MarketingContentPage
      eyebrow="L'equipe"
      title="Une petite equipe qui pense gros."
      intro="Nous n'avons pas la pretention d'etre nombreux. Nous avons celle d'etre proches du terrain."
    >
      <div className="not-prose mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {TEAM.map((m) => (
          <div
            key={m.name}
            className="rounded-2xl border p-6"
            style={{ borderColor: 'var(--skin-border)' }}
          >
            <h3
              className="text-lg font-bold"
              style={{ color: 'var(--skin-foreground)' }}
            >
              {m.name}
            </h3>
            <p
              className="mt-1 text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--skin-primary)' }}
            >
              {m.role}
            </p>
            <p
              className="mt-3 text-sm"
              style={{ color: 'var(--skin-muted)' }}
            >
              {m.desc}
            </p>
          </div>
        ))}
      </div>
    </MarketingContentPage>
  );
}
