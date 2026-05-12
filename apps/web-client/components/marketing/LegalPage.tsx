import type { ReactNode } from 'react';

interface Props {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}

/**
 * Layout commun pour les pages legales (CGV, confidentialite, cookies,
 * mentions legales). Centre le contenu, applique la typographie standard
 * et affiche la date de derniere mise a jour. Le contenu lui-meme reste
 * a la charge de chaque page.
 */
export function LegalPage({ title, lastUpdated, children }: Props) {
  return (
    <article className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-10">
        <p
          className="text-xs font-bold uppercase tracking-[0.2em]"
          style={{ color: 'var(--skin-primary)' }}
        >
          Mentions legales
        </p>
        <h1
          className="mt-3 text-4xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          {title}
        </h1>
        <p className="mt-3 text-sm" style={{ color: 'var(--skin-muted)' }}>
          Derniere mise a jour : {lastUpdated}
        </p>
      </header>
      <div
        className="prose prose-sm max-w-none [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mt-1"
        style={{ color: 'var(--skin-foreground)' }}
      >
        {children}
      </div>
    </article>
  );
}
