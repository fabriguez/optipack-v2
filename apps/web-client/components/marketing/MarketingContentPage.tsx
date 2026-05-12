import type { ReactNode } from 'react';

interface Props {
  eyebrow?: string;
  title: string;
  intro?: string;
  children?: ReactNode;
}

/**
 * Coquille commune pour les pages marketing contenu (about, team, careers,
 * press, blog, docs, support, status, api-docs...). Typographie unifiee,
 * meme largeur que les pages legales pour coherence visuelle.
 */
export function MarketingContentPage({ eyebrow, title, intro, children }: Props) {
  return (
    <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
      <header className="mb-10 text-center">
        {eyebrow && (
          <p
            className="text-xs font-bold uppercase tracking-[0.2em]"
            style={{ color: 'var(--skin-primary)' }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className="mt-3 text-4xl font-bold tracking-tight skin-font-heading"
          style={{ color: 'var(--skin-foreground)' }}
        >
          {title}
        </h1>
        {intro && (
          <p
            className="mx-auto mt-4 max-w-2xl text-base"
            style={{ color: 'var(--skin-muted)' }}
          >
            {intro}
          </p>
        )}
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
