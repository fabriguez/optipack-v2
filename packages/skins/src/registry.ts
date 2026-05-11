/**
 * Skin registry. Combines built-in skins with runtime-registered custom skins.
 * Used by the SkinProvider and the orchestrator-side validator.
 */

import { BUILTIN_SKINS, DEFAULT_SKIN_ID } from './skins';
import { DEFAULT_SKIN_IMAGES } from './default-images';
import type {
  ResolvedSkin,
  SkinCustomization,
  SkinId,
  SkinTokens,
} from './types';

const registry = new Map<string, SkinTokens>(Object.entries(BUILTIN_SKINS));

/** Register a new skin (extends without rebuild). */
export function registerSkin(skin: SkinTokens): void {
  registry.set(skin.id, skin);
}

/** Bulk register (useful for server-driven skin catalogues). */
export function registerSkins(skins: SkinTokens[]): void {
  for (const s of skins) registry.set(s.id, s);
}

export function listSkins(): SkinTokens[] {
  return Array.from(registry.values());
}

export function getSkin(id: SkinId): SkinTokens | undefined {
  return registry.get(id);
}

export function isKnownSkinId(id: string): boolean {
  return registry.has(id);
}

/** Resolve a skin id + customization into a fully-populated ResolvedSkin. */
export function resolveSkin(id: SkinId, custom?: SkinCustomization): ResolvedSkin {
  const base = registry.get(id) ?? registry.get(DEFAULT_SKIN_ID)!;

  const overrideImg = custom?.imageOverrides ?? {};
  const baseImg = base.images ?? {};

  const images: ResolvedSkin['images'] = {
    preview: overrideImg.preview ?? baseImg.preview ?? DEFAULT_SKIN_IMAGES.preview,
    hero: overrideImg.hero ?? baseImg.hero ?? DEFAULT_SKIN_IMAGES.hero,
    authShell:
      overrideImg.authShell ??
      baseImg.authShell ??
      baseImg.hero ??
      DEFAULT_SKIN_IMAGES.authShell,
    journey:
      overrideImg.journey ?? baseImg.journey ?? DEFAULT_SKIN_IMAGES.journey,
    testimonialAvatars:
      overrideImg.testimonialAvatars ??
      baseImg.testimonialAvatars ??
      DEFAULT_SKIN_IMAGES.testimonialAvatars,
    extras: { ...(baseImg.extras ?? {}), ...(overrideImg.extras ?? {}) },
  };

  return {
    ...base,
    primary: custom?.primary ?? base.primary,
    accent: custom?.accent ?? base.accent,
    radius: custom?.radius ?? base.radius,
    fontBody: custom?.fontBody ?? base.fontBody,
    fontHeading: custom?.fontHeading ?? base.fontHeading,
    images,
  };
}
