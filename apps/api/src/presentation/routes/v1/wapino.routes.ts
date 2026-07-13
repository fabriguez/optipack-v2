import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { wapinoService } from '../../../application/services/whatsapp/WapinoService';

/**
 * Config Wapino du tenant (fallback WhatsApp apres le canal perso).
 * Endroit de config DISTINCT du canal WhatsApp personnel : les deux canaux
 * peuvent etre configures et connectes en meme temps.
 */

const router = Router();
const adminOnly = [authenticate, authorize('SUPER_ADMIN', 'ADMIN')];

function getOrgId(req: Request): string {
  const orgId = req.user!.organizationId;
  if (!orgId) throw new Error('Utilisateur sans organisation assignée');
  return orgId;
}

// ── GET /wapino/status ────────────────────────────────────────────────────────
// Config du tenant + dernier envoi OK / derniere erreur. (Wapino n'expose pas
// de statut de session a la cle API : pas de statut live.)

router.get(
  '/wapino/status',
  ...adminOnly,
  requirePermission('settings.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const state = await wapinoService.getStatus(organizationId);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /wapino/config ────────────────────────────────────────────────────────
// Cle API (Bearer wp_live_...), nom d'instance, base URL optionnelle, activation.

const configSchema = z.object({
  enabled: z.boolean().optional(),
  // Chaîne vide = effacer. Absent = inchangé.
  apiKey: z.string().max(500).optional(),
  instance: z.string().max(100).optional(),
  // Chaîne vide = remettre la base par defaut (api.wapino.consolidis.com/v1).
  baseUrl: z.string().url().max(300).optional().or(z.literal('')),
});

router.put(
  '/wapino/config',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const body = configSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ success: false, errors: body.error.flatten() });
      }
      const state = await wapinoService.saveConfig(organizationId, body.data);
      res.json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /wapino/test ─────────────────────────────────────────────────────────
// Teste la config en envoyant un message texte reel au numero fourni
// (config fournie, sinon celle enregistree).

const testSchema = z.object({
  phone: z.string().min(6).max(20),
  apiKey: z.string().max(500).optional(),
  instance: z.string().max(100).optional(),
  baseUrl: z.string().url().max(300).optional().or(z.literal('')),
});

router.post(
  '/wapino/test',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const body = testSchema.safeParse(req.body ?? {});
      if (!body.success) {
        return res.status(400).json({ success: false, errors: body.error.flatten() });
      }
      await wapinoService.testConnection(organizationId, body.data);
      res.json({ success: true, message: 'Message de test envoyé via Wapino' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec du test Wapino';
      res.status(400).json({ success: false, message });
    }
  },
);

// ── DELETE /wapino/config ─────────────────────────────────────────────────────
// Desactive le fallback et efface la cle API du tenant.

router.delete(
  '/wapino/config',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      await wapinoService.clearConfig(organizationId);
      res.json({ success: true, message: 'Configuration Wapino effacée' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
