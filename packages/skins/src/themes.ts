/**
 * Themes (palettes de couleurs) decoupes des skins (layouts). Un tenant
 * choisit independamment :
 *   - un SKIN -> layout du site web public (composition de sections)
 *   - un THEME -> palette de couleurs appliquee partout (dashboard, mails,
 *     site public)
 *
 * Si themeId est null, on retombe sur la palette par defaut du skin.
 */

export interface ThemeTokens {
  id: string;
  name: string;
  description: string;
  primary: string;
  secondary: string;
  accent: string;
  surface: string;
  background: string;
  foreground: string;
  muted: string;
  border: string;
  /** 3 stops pour gradients hero / CTA. */
  gradient: [string, string, string];
  mood: 'natural' | 'corporate' | 'warm' | 'dark' | 'minimal' | 'ocean' | 'royal' | string;
}

export const BUILTIN_THEMES: Record<string, ThemeTokens> = {
  emerald: {
    id: 'emerald',
    name: 'Emeraude',
    description: 'Vert naturel, confiance et stabilite (logistique mainstream).',
    primary: '#1B5E20',
    secondary: '#4CAF50',
    accent: '#A5D6A7',
    surface: '#FFFFFF',
    background: '#F4F8F2',
    foreground: '#0B1A0D',
    muted: '#5A6B5C',
    border: '#DCE5DA',
    gradient: ['#1B5E20', '#388E3C', '#A5D6A7'],
    mood: 'natural',
  },
  sapphire: {
    id: 'sapphire',
    name: 'Saphir',
    description: 'Bleu corporate, precis et serieux (B2B / finance).',
    primary: '#1E40AF',
    secondary: '#3B82F6',
    accent: '#93C5FD',
    surface: '#FFFFFF',
    background: '#F5F7FB',
    foreground: '#0A1226',
    muted: '#5B6478',
    border: '#DCE2EE',
    gradient: ['#1E3A8A', '#2563EB', '#60A5FA'],
    mood: 'corporate',
  },
  amber: {
    id: 'amber',
    name: 'Ambre',
    description: 'Orange chaleureux, energique (B2C grand public).',
    primary: '#C2410C',
    secondary: '#F97316',
    accent: '#FDBA74',
    surface: '#FFFFFF',
    background: '#FFF7F2',
    foreground: '#1A0B05',
    muted: '#7A5849',
    border: '#F2DECD',
    gradient: ['#9A3412', '#EA580C', '#FDBA74'],
    mood: 'warm',
  },
  midnight: {
    id: 'midnight',
    name: 'Minuit',
    description: 'Violet profond, dark mode premium (editorial / nuit).',
    primary: '#A78BFA',
    secondary: '#7C3AED',
    accent: '#F0ABFC',
    surface: '#10131C',
    background: '#070912',
    foreground: '#F5F3FF',
    muted: '#8E8AB0',
    border: '#1E2233',
    gradient: ['#0B0E1A', '#312E81', '#A78BFA'],
    mood: 'dark',
  },
  rose: {
    id: 'rose',
    name: 'Rose',
    description: 'Pastel doux, accessible et accueillant (B2C niche).',
    primary: '#EC4899',
    secondary: '#A855F7',
    accent: '#F0ABFC',
    surface: '#FFFFFF',
    background: '#FDF6FB',
    foreground: '#1F0A1E',
    muted: '#7A5F77',
    border: '#F1DDEB',
    gradient: ['#DB2777', '#C026D3', '#F472B6'],
    mood: 'minimal',
  },
  ocean: {
    id: 'ocean',
    name: 'Ocean',
    description: 'Teal frais, marine et tech (SaaS / data).',
    primary: '#0F766E',
    secondary: '#14B8A6',
    accent: '#5EEAD4',
    surface: '#FFFFFF',
    background: '#F0FDFA',
    foreground: '#042F2E',
    muted: '#4F6E6C',
    border: '#CCFBF1',
    gradient: ['#134E4A', '#0F766E', '#5EEAD4'],
    mood: 'ocean',
  },
  royal: {
    id: 'royal',
    name: 'Royal',
    description: 'Indigo + or, premium et institutionnel.',
    primary: '#312E81',
    secondary: '#6366F1',
    accent: '#FBBF24',
    surface: '#FFFFFF',
    background: '#F8F7FF',
    foreground: '#0F0D2E',
    muted: '#5C5A75',
    border: '#E0DEF5',
    gradient: ['#1E1B4B', '#4338CA', '#FBBF24'],
    mood: 'royal',
  },
  graphite: {
    id: 'graphite',
    name: 'Graphite',
    description: 'Gris monochrome, ultra-minimal et neutre.',
    primary: '#1F2937',
    secondary: '#4B5563',
    accent: '#9CA3AF',
    surface: '#FFFFFF',
    background: '#F9FAFB',
    foreground: '#030712',
    muted: '#6B7280',
    border: '#E5E7EB',
    gradient: ['#111827', '#374151', '#9CA3AF'],
    mood: 'minimal',
  },
};

export const DEFAULT_THEME_ID = 'emerald';

export function getTheme(id: string | null | undefined): ThemeTokens {
  if (!id) return BUILTIN_THEMES[DEFAULT_THEME_ID];
  return BUILTIN_THEMES[id] ?? BUILTIN_THEMES[DEFAULT_THEME_ID];
}

export function isKnownThemeId(id: string | null | undefined): boolean {
  if (!id) return false;
  return id in BUILTIN_THEMES;
}

export function listThemes(): ThemeTokens[] {
  return Object.values(BUILTIN_THEMES);
}

/**
 * Applique le theme au document (CSS vars). Idempotent. Surcharge les
 * couleurs ecrites par le skin -- a appeler APRES applySkinById si un
 * theme explicite est defini.
 */
// Le package est CJS + n'a pas dom dans son tsconfig (cible Node). On
// declare document/window ambiently comme dans apply.ts -- les helpers
// browser-only restent gardes par `typeof document === 'undefined'`.
declare const document: any;

export function applyThemeById(themeId: string): void {
  if (typeof document === 'undefined') return;
  const theme = getTheme(themeId);
  const root = document.documentElement;
  // CSS vars skin-* utilises par les composants web-client
  root.style.setProperty('--skin-primary', theme.primary);
  root.style.setProperty('--skin-secondary', theme.secondary);
  root.style.setProperty('--skin-accent', theme.accent);
  root.style.setProperty('--skin-surface', theme.surface);
  root.style.setProperty('--skin-background', theme.background);
  root.style.setProperty('--skin-foreground', theme.foreground);
  root.style.setProperty('--skin-foreground-muted', theme.muted);
  root.style.setProperty('--skin-border', theme.border);
  root.style.setProperty('--skin-gradient-1', theme.gradient[0]);
  root.style.setProperty('--skin-gradient-2', theme.gradient[1]);
  root.style.setProperty('--skin-gradient-3', theme.gradient[2]);
  root.style.setProperty('--skin-hero-2', theme.gradient[1]);
  root.style.setProperty('--skin-hero-3', theme.gradient[2]);
}
