import { z } from 'zod';

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

/** URL HTTPS recommandee (HTTP toleré en dev). */
export const httpUrlSchema = z.string().url();
