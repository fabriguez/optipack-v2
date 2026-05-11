/**
 * Browser-only helpers : apply a resolved skin to the document's CSS variables,
 * and serialize a skin to a CSS string (used for scoped previews/iframes).
 *
 * This module is imported by server runtimes too (api, orchestrator) through
 * the package barrel, so we declare `document` ambiently below to compile
 * under non-DOM `lib` configurations. Runtime guards prevent server execution.
 */

import { generatePalette } from './palette';
import { resolveSkin } from './registry';
import type { ResolvedSkin, SkinCustomization, ShadowFlavor, SkinId } from './types';

// Ambient declaration so packages targeting node (api, orchestrator) compile
// without the DOM lib. Real DOM is available in the browser at runtime.
declare const document: any;

const SHADOW_PRESETS: Record<ShadowFlavor, string> = {
  soft: '0 10px 30px -12px rgba(0,0,0,0.18), 0 4px 12px -4px rgba(0,0,0,0.08)',
  sharp: '0 1px 0 rgba(0,0,0,0.06), 0 12px 24px -16px rgba(0,0,0,0.25)',
  glow: '0 18px 60px -20px var(--skin-glow,rgba(99,102,241,0.45)), 0 4px 12px -4px rgba(0,0,0,0.18)',
  flat: '0 1px 2px rgba(0,0,0,0.04)',
};

export function applySkinToDocument(skin: ResolvedSkin): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const palette = generatePalette(skin.primary);

  for (const [shade, value] of Object.entries(palette)) {
    root.style.setProperty(`--color-primary-${shade}`, value);
  }

  root.style.setProperty('--skin-primary', skin.primary);
  root.style.setProperty('--skin-secondary', skin.secondary);
  root.style.setProperty('--skin-accent', skin.accent);
  root.style.setProperty('--skin-surface', skin.surface);
  root.style.setProperty('--skin-background', skin.background);
  root.style.setProperty('--skin-foreground', skin.foreground);
  root.style.setProperty('--skin-muted', skin.muted);
  root.style.setProperty('--skin-border', skin.border);
  root.style.setProperty('--skin-hero-1', skin.heroGradient[0]);
  root.style.setProperty('--skin-hero-2', skin.heroGradient[1]);
  root.style.setProperty('--skin-hero-3', skin.heroGradient[2]);
  root.style.setProperty('--skin-font-body', skin.fontBody);
  root.style.setProperty('--skin-font-heading', skin.fontHeading);
  root.style.setProperty('--skin-radius', `${skin.radius}rem`);
  root.style.setProperty('--skin-radius-sm', `${skin.radius * 0.6}rem`);
  root.style.setProperty('--skin-radius-lg', `${skin.radius * 1.4}rem`);
  root.style.setProperty('--skin-radius-xl', `${skin.radius * 1.8}rem`);
  root.style.setProperty('--skin-shadow', SHADOW_PRESETS[skin.shadowFlavor]);
  root.style.setProperty('--skin-glow', `${skin.primary}66`);
  root.setAttribute('data-skin', skin.id);
  root.setAttribute('data-skin-mood', skin.mood);
}

export function applySkinById(
  id: SkinId,
  custom?: SkinCustomization,
): ResolvedSkin {
  const resolved = resolveSkin(id, custom);
  applySkinToDocument(resolved);
  return resolved;
}

export function skinToCssString(skin: ResolvedSkin): string {
  const palette = generatePalette(skin.primary);
  const paletteVars = Object.entries(palette)
    .map(([k, v]) => `--color-primary-${k}: ${v};`)
    .join('\n  ');
  return `:root {
  ${paletteVars}
  --skin-primary: ${skin.primary};
  --skin-secondary: ${skin.secondary};
  --skin-accent: ${skin.accent};
  --skin-surface: ${skin.surface};
  --skin-background: ${skin.background};
  --skin-foreground: ${skin.foreground};
  --skin-muted: ${skin.muted};
  --skin-border: ${skin.border};
  --skin-hero-1: ${skin.heroGradient[0]};
  --skin-hero-2: ${skin.heroGradient[1]};
  --skin-hero-3: ${skin.heroGradient[2]};
  --skin-font-body: ${skin.fontBody};
  --skin-font-heading: ${skin.fontHeading};
  --skin-radius: ${skin.radius}rem;
  --skin-radius-sm: ${skin.radius * 0.6}rem;
  --skin-radius-lg: ${skin.radius * 1.4}rem;
  --skin-radius-xl: ${skin.radius * 1.8}rem;
  --skin-shadow: ${SHADOW_PRESETS[skin.shadowFlavor]};
  --skin-glow: ${skin.primary}66;
}`;
}
