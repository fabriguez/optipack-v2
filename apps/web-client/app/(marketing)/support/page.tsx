import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { MarketingContentPage } from '@/components/marketing/MarketingContentPage';

export const metadata: Metadata = {
  title: 'Support | Transit Soft Services',
  description: 'Comment nous contacter pour toute question.',
};

const CHANNELS = [
  {
    icon: Mail,
    title: 'Email',
    desc: 'Reponse sous 24h en jours ouvres.',
    cta: 'support@transitsoftservices.com',
    href: 'mailto:support@transitsoftservices.com',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp',
    desc: 'Le plus rapide pour les questions courtes.',
    cta: 'Ouvrir WhatsApp',
    href: 'https://wa.me/237600000000',
  },
  {
    icon: Phone,
    title: 'Telephone',
    desc: 'Du lundi au vendredi, 8h-18h (GMT+1).',
    cta: '+237 6XX XXX XXX',
    href: 'tel:+237600000000',
  },
];

export default function SupportPage() {
  return (
    <MarketingContentPage
      eyebrow="Support"
      title="On est la pour vous aider."
      intro="Que vous soyez client final ou agence partenaire, choisissez le canal qui vous arrange."
    >
      <div className="not-prose mt-8 grid gap-4 sm:grid-cols-3">
        {CHANNELS.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.title}
              href={c.href}
              target={c.href.startsWith('http') ? '_blank' : undefined}
              className="block rounded-2xl border p-6 transition-colors hover:bg-black/[.02]"
              style={{ borderColor: 'var(--skin-border)' }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ background: 'var(--skin-primary)', opacity: 0.15 }}
              >
                <Icon className="h-5 w-5" style={{ color: 'var(--skin-primary)' }} />
              </div>
              <h3
                className="mt-4 text-base font-bold"
                style={{ color: 'var(--skin-foreground)' }}
              >
                {c.title}
              </h3>
              <p
                className="mt-1 text-xs"
                style={{ color: 'var(--skin-muted)' }}
              >
                {c.desc}
              </p>
              <p
                className="mt-3 text-sm font-semibold"
                style={{ color: 'var(--skin-primary)' }}
              >
                {c.cta}
              </p>
            </Link>
          );
        })}
      </div>

      <h2>Questions frequentes</h2>
      <h3>Je n&apos;arrive pas a creer un compte</h3>
      <p>
        Verifiez que votre numero de telephone commence bien par
        l&apos;indicatif pays (+237 par exemple) et que votre mot de passe
        fait au moins 6 caracteres. Si vous obtenez "numero deja associe",
        utilisez la page connexion.
      </p>
      <h3>Mon colis n&apos;apparait pas au tracking</h3>
      <p>
        Verifiez le numero de tracking exact tel qu&apos;indique sur votre
        recu. Les colis tres recents peuvent prendre quelques minutes a
        apparaitre apres enregistrement par l&apos;agence.
      </p>
      <h3>Je veux supprimer mon compte</h3>
      <p>
        Envoyez-nous un email a{' '}
        <Link
          href="mailto:privacy@transitsoftservices.com"
          className="font-semibold underline"
          style={{ color: 'var(--skin-primary)' }}
        >
          privacy@transitsoftservices.com
        </Link>{' '}
        depuis l&apos;email associe a votre compte. Suppression effective sous
        7 jours (les donnees comptables liees sont conservees selon la loi).
      </p>
    </MarketingContentPage>
  );
}
