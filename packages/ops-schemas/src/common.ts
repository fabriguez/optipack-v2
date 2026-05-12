import { z } from 'zod';
// URL est global en Node 18+ et dans tout navigateur moderne. Cette
// reference assure la disponibilite cote runtime ; le typage est fourni
// par TS lib DOM/Node.
declare const URL: { new (s: string): { protocol: string } };

/** Slug DNS-safe : minuscules, chiffres, tirets. */
export const slugSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'slug : minuscules, chiffres, tirets uniquement');

/** Couleur hex #RRGGBB. */
export const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'format hex #RRGGBB');

/** UUID v4 (Prisma defaut). */
export const uuidSchema = z.string().uuid();

/** Email standard. */
export const emailSchema = z.string().email();

/**
 * URL HTTP(S) ou data: (logos uploades en base64 cote ops-admin quand il n'y
 * a pas d'object storage configure cote orchestrator).
 */
export const httpUrlSchema = z.string().refine(
  (s) => {
    if (s.startsWith('data:')) return s.length < 2_000_000; // ~1.5 Mo decode
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'URL invalide (http(s):// ou data: attendu, max ~1.5 Mo)' },
);
