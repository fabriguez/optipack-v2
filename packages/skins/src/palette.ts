/**
 * Hex -> 50..900 Tailwind-like palette generator.
 * Pure TS, no deps. Re-exported from the package root for app + server use.
 */

export interface ColorPalette {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.substring(0, 2), 16),
    parseInt(clean.substring(2, 4), 16),
    parseInt(clean.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;
  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rN) h = ((gN - bN) / d + (gN < bN ? 6 : 0)) / 6;
    else if (max === gN) h = ((bN - rN) / d + 2) / 6;
    else h = ((rN - gN) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number) =>
    lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

const TARGET_LIGHTNESS: Record<keyof ColorPalette, number> = {
  50: 96,
  100: 90,
  200: 80,
  300: 70,
  400: 58,
  500: 46,
  600: 38,
  700: 30,
  800: 22,
  900: 14,
};

// Liste des shades explicite pour eviter les casts string[] -> keyof ColorPalette[]
// que `tsc` strict refuse.
const SHADE_KEYS: Array<keyof ColorPalette> = [
  50, 100, 200, 300, 400, 500, 600, 700, 800, 900,
];

export function generatePalette(baseHex: string): ColorPalette {
  const [r, g, b] = hexToRgb(baseHex);
  const [h, s] = rgbToHsl(r, g, b);
  const palette = {} as ColorPalette;
  for (const key of SHADE_KEYS) {
    const lightness = TARGET_LIGHTNESS[key];
    const [pr, pg, pb] = hslToRgb(h, Math.min(s, 70), lightness);
    palette[key] = rgbToHex(pr, pg, pb);
  }
  return palette;
}
