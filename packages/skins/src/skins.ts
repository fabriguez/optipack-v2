/**
 * Built-in skin presets. To add a new skin, append it here OR call
 * `registerSkin(definition)` at runtime (e.g. server-driven skins from the
 * orchestrator's tenant config).
 */

import type { SkinTokens } from './types';

export const BUILTIN_SKINS: Record<string, SkinTokens> = {
  forest: {
    id: 'forest',
    name: 'Forest',
    tagline: 'Naturel & confiance - parfait pour la logistique',
    primary: '#1B5E20',
    secondary: '#4CAF50',
    accent: '#A5D6A7',
    surface: '#FFFFFF',
    background: '#F4F8F2',
    foreground: '#0B1A0D',
    muted: '#5A6B5C',
    border: '#DCE5DA',
    heroGradient: ['#1B5E20', '#388E3C', '#A5D6A7'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 0.75,
    shadowFlavor: 'soft',
    mood: 'natural',
    layoutVariant: 'classic',
    images: {
      preview:
        'https://images.unsplash.com/photo-1494412519320-aa613dfb7738?auto=format&fit=crop&w=800&q=70',
      hero:
        'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=1400&q=70',
      authShell:
        'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?auto=format&fit=crop&w=1400&q=70',
      journey: [
        'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1601158935942-52255782d322?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=70',
      ],
    },
  },
  sapphire: {
    id: 'sapphire',
    name: 'Sapphire',
    tagline: 'Corporate & precis - pour les operations B2B',
    primary: '#1E40AF',
    secondary: '#3B82F6',
    accent: '#93C5FD',
    surface: '#FFFFFF',
    background: '#F5F7FB',
    foreground: '#0A1226',
    muted: '#5B6478',
    border: '#DCE2EE',
    heroGradient: ['#1E3A8A', '#2563EB', '#60A5FA'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 0.5,
    shadowFlavor: 'sharp',
    mood: 'corporate',
    layoutVariant: 'bold',
    images: {
      preview:
        'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=800&q=70',
      hero:
        'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=70',
      authShell:
        'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1400&q=70',
      journey: [
        'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=70',
      ],
    },
  },
  sunset: {
    id: 'sunset',
    name: 'Sunset',
    tagline: 'Chaud & energique - taille pour les coursiers',
    primary: '#C2410C',
    secondary: '#F97316',
    accent: '#FDBA74',
    surface: '#FFFFFF',
    background: '#FFF7F2',
    foreground: '#1A0B05',
    muted: '#7A5849',
    border: '#F2DECD',
    heroGradient: ['#9A3412', '#EA580C', '#FDBA74'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 1.25,
    shadowFlavor: 'glow',
    mood: 'warm',
    layoutVariant: 'magazine',
    images: {
      preview:
        'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=800&q=70',
      hero:
        'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1400&q=70',
      authShell:
        'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=1400&q=70',
      journey: [
        'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1542838687-3c5e93f15406?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1474314881477-04c4aac40a0e?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1532635241-17e820acc59f?auto=format&fit=crop&w=1200&q=70',
      ],
    },
  },
  midnight: {
    id: 'midnight',
    name: 'Midnight',
    tagline: 'Dark mode premium - editorial et sleek',
    primary: '#A78BFA',
    secondary: '#7C3AED',
    accent: '#F0ABFC',
    surface: '#10131C',
    background: '#070912',
    foreground: '#F5F3FF',
    muted: '#8E8AB0',
    border: '#1E2233',
    heroGradient: ['#0B0E1A', '#312E81', '#A78BFA'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 1,
    shadowFlavor: 'glow',
    mood: 'dark',
    layoutVariant: 'editorial',
    images: {
      preview:
        'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=800&q=70',
      hero:
        'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?auto=format&fit=crop&w=1400&q=70',
      authShell:
        'https://images.unsplash.com/photo-1538370965046-79c0d6907d47?auto=format&fit=crop&w=1400&q=70',
      journey: [
        'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1517649763962-0c623066013b?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1493244040629-496f6d136cb3?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&w=1200&q=70',
      ],
    },
  },
  pastel: {
    id: 'pastel',
    name: 'Pastel',
    tagline: 'Doux & accessible - parfait pour le B2C',
    primary: '#EC4899',
    secondary: '#A855F7',
    accent: '#F0ABFC',
    surface: '#FFFFFF',
    background: '#FDF6FB',
    foreground: '#1F0A1E',
    muted: '#7A5F77',
    border: '#F1DDEB',
    heroGradient: ['#DB2777', '#C026D3', '#F472B6'],
    fontBody: 'Geist, system-ui, sans-serif',
    fontHeading: 'Geist, system-ui, sans-serif',
    radius: 1.5,
    shadowFlavor: 'flat',
    mood: 'minimal',
    layoutVariant: 'minimal',
    images: {
      preview:
        'https://images.unsplash.com/photo-1620207418302-439b387441b0?auto=format&fit=crop&w=800&q=70',
      hero:
        'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=1400&q=70',
      authShell:
        'https://images.unsplash.com/photo-1551782450-a2132b4ba21d?auto=format&fit=crop&w=1400&q=70',
      journey: [
        'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1487754180451-c456f719a1fc?auto=format&fit=crop&w=1200&q=70',
        'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=70',
      ],
    },
  },
};

export const DEFAULT_SKIN_ID = 'forest';
