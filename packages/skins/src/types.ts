/**
 * Shared skin types. Used by:
 * - apps/web-client (rendering)
 * - apps/web (future shared theming)
 * - apps/orchestrator (validation of tenant.skinId on persistence)
 *
 * Skins are extensible : new presets can be registered at runtime via
 * `registerSkin()` from this package, OR by adding a new entry to the
 * BUILTIN_SKINS map below.
 */

export type SkinId = string;

export type ShadowFlavor = 'soft' | 'sharp' | 'glow' | 'flat';

export type SkinMood = 'natural' | 'corporate' | 'warm' | 'dark' | 'minimal' | string;

/**
 * Layout du site public (web-client home page). Chaque skin choisit une
 * disposition + composition de sections. Pas juste les couleurs.
 *  - classic   : Hero centre + features grid + stats + pricing cards + CTA
 *  - bold      : Hero split + features tabs + pricing table + CTA full-bleed
 *  - magazine  : Hero fullbleed + features cards alternees + stats inline
 *  - minimal   : Hero typographique + features list + pricing minimal
 *  - editorial : Hero video/image + sections en colonnes asymetriques
 *
 * Web-client mappe layoutVariant -> composant React via registry. Pour ajouter
 * un nouveau layout, etendre l'union ici + creer le composant cote web-client
 * + l'enregistrer dans HOME_LAYOUTS.
 */
export type LayoutVariant = 'classic' | 'bold' | 'magazine' | 'minimal' | 'editorial';

/**
 * Image slots used by the web-client. Each skin can override any subset.
 * Slots that are not provided fall back to the global DEFAULT_SKIN_IMAGES.
 */
export interface SkinImages {
  /** Preview thumbnail shown in the Studio and SkinPicker. */
  preview?: string;
  /** Hero/auth side-image fallback when no other slot is set. */
  hero?: string;
  /** Auth split-screen storytelling image (login + register). */
  authShell?: string;
  /** Per-step images for the "parcel journey" scroll-driven section.
   *  5 entries by convention but variable. */
  journey?: string[];
  /** Faces of the floating user avatars in Hero (4 entries). */
  testimonialAvatars?: string[];
  /** Free-form additional images callable via `images.extras[key]`. */
  extras?: Record<string, string>;
}

export interface SkinTokens {
  id: SkinId;
  name: string;
  tagline: string;
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
  heroGradient: [string, string, string];
  fontBody: string;
  fontHeading: string;
  radius: number;
  shadowFlavor: ShadowFlavor;
  mood: SkinMood;
  /** Layout du site public (compose differente de sections). Defaut classic. */
  layoutVariant: LayoutVariant;
  /** Per-skin images (preview, hero, journey steps, avatars...). Optional - falls back to defaults. */
  images: SkinImages;
}

export interface SkinCustomization {
  primary?: string;
  accent?: string;
  radius?: number;
  fontBody?: string;
  fontHeading?: string;
  /** Per-image-slot overrides (tenant can replace a single image). */
  imageOverrides?: SkinImages;
}

export type ResolvedSkin = SkinTokens & {
  /** Effective images after merge with defaults + customization. Never undefined. */
  images: Required<Pick<SkinImages, 'preview' | 'hero' | 'authShell'>> & SkinImages;
};
