'use client';

import type { ReactNode } from 'react';
import { useSkin } from '@/lib/providers/SkinProvider';
import type { LayoutVariant } from '@transitsoftservices/skins';

import { MarketingNav } from '@/components/marketing/MarketingNav';
import { Footer } from '@/components/marketing/Footer';
import { NavBoldCorporate } from '@/components/marketing/navs/NavBoldCorporate';
import { NavMagazineFloating } from '@/components/marketing/navs/NavMagazineFloating';
import { NavEditorialVertical } from '@/components/marketing/navs/NavEditorialVertical';
import { NavMinimalCenter } from '@/components/marketing/navs/NavMinimalCenter';
import { FooterBoldDark } from '@/components/marketing/footers/FooterBoldDark';
import { FooterMagazineMasthead } from '@/components/marketing/footers/FooterMagazineMasthead';
import { FooterEditorialColophon } from '@/components/marketing/footers/FooterEditorialColophon';
import { FooterMinimalLine } from '@/components/marketing/footers/FooterMinimalLine';

/**
 * Shell marketing par skin/layoutVariant. Couvre Nav + Footer + container
 * de contenu. Toutes les pages marketing partagent ce shell ; seul le
 * contenu (children) varie. Resultat : changer de skin change *tout* le
 * site visuellement (nav, footer, espace, type), pas juste la home.
 *
 * Variants :
 *  - classic   : MarketingNav (glass scroll) + Footer (4 cols green)
 *  - bold      : NavBoldCorporate (dark strict) + FooterBoldDark (5 cols)
 *  - magazine  : NavMagazineFloating (pill scroll) + FooterMagazineMasthead (geant serif)
 *  - editorial : NavEditorialVertical (rail gauche desktop) + FooterEditorialColophon
 *  - minimal   : NavMinimalCenter (3 zones epurees) + FooterMinimalLine (1 ligne)
 *
 * Le container du main wrappe le contenu : padding-top variant (compense
 * fixed nav) + max-width variant + ambient bg variant (gradient sur
 * magazine, grid bg sur bold, rien sur minimal).
 */

interface ShellPieces {
  Nav: React.ComponentType;
  Footer: React.ComponentType;
  /** Padding top du main pour compenser nav fixe / absente. */
  mainTopPadding: string;
  /** Padding left desktop pour eviter le rail vertical editorial. */
  mainLeftPadding: string;
  /** Ambient background du site entier. */
  ambient?: React.ReactNode;
}

const SHELLS: Record<LayoutVariant, ShellPieces> = {
  classic: {
    Nav: MarketingNav,
    Footer: Footer,
    mainTopPadding: 'pt-0',
    mainLeftPadding: '',
  },
  bold: {
    Nav: NavBoldCorporate,
    Footer: FooterBoldDark,
    mainTopPadding: 'pt-0',
    mainLeftPadding: '',
    ambient: (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          color: 'var(--skin-foreground)',
        }}
      />
    ),
  },
  magazine: {
    Nav: NavMagazineFloating,
    Footer: FooterMagazineMasthead,
    mainTopPadding: 'pt-0',
    mainLeftPadding: '',
    ambient: (
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-50"
        style={{
          background: `radial-gradient(ellipse at top, color-mix(in oklab, var(--skin-accent) 30%, transparent), transparent 70%)`,
        }}
      />
    ),
  },
  editorial: {
    Nav: NavEditorialVertical,
    Footer: FooterEditorialColophon,
    mainTopPadding: 'pt-14 lg:pt-0',
    mainLeftPadding: 'lg:pl-20',
  },
  minimal: {
    Nav: NavMinimalCenter,
    Footer: FooterMinimalLine,
    mainTopPadding: 'pt-0',
    mainLeftPadding: '',
  },
};

export function MarketingShell({ children }: { children: ReactNode }) {
  const { resolved } = useSkin();
  const variant =
    ((resolved as { layoutVariant?: LayoutVariant } | undefined)?.layoutVariant ?? 'classic') as LayoutVariant;
  const { Nav, Footer: F, mainTopPadding, mainLeftPadding, ambient } = SHELLS[variant] ?? SHELLS.classic;
  return (
    <div className="relative" style={{ background: 'var(--skin-background)' }}>
      {ambient}
      <Nav />
      <main className={`${mainTopPadding} ${mainLeftPadding}`}>{children}</main>
      <F />
    </div>
  );
}
