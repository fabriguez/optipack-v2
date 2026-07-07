import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { tenantWaSessionService } from '../../../application/services/whatsapp/TenantWhatsAppSessionService';

const router = Router();
const adminOnly = [authenticate, authorize('SUPER_ADMIN', 'ADMIN')];

function getOrgId(req: Request): string {
  const orgId = req.user!.organizationId;
  if (!orgId) throw new Error('Utilisateur sans organisation assignée');
  return orgId;
}

// ── GET /whatsapp-personal/status ─────────────────────────────────────────────
// État courant : config du tenant + statut live de la session sur l'API externe.

router.get(
  '/whatsapp-personal/status',
  ...adminOnly,
  requirePermission('settings.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const state = await tenantWaSessionService.getStatus(organizationId);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /whatsapp-personal/config ─────────────────────────────────────────────
// Enregistre les variables de la session : clé API (par tenant), base URL
// optionnelle, activation du canal.

const configSchema = z.object({
  enabled: z.boolean().optional(),
  // Chaîne vide = effacer la clé. Absent = inchangé.
  apiKey: z.string().max(500).optional(),
  // Chaîne vide = remettre la base URL globale (WA_API_URL). Absent = inchangé.
  baseUrl: z.string().url().max(300).optional().or(z.literal('')),
});

router.put(
  '/whatsapp-personal/config',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const body = configSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ success: false, errors: body.error.flatten() });
      }
      const state = await tenantWaSessionService.saveConfig(organizationId, body.data);
      res.json({ success: true, data: state });
    } catch (err) {
      next(err);
    }
  },
);

// ── POST /whatsapp-personal/test ──────────────────────────────────────────────
// Teste la connexion (clé/base URL fournies, sinon celles enregistrées) via
// GET /v1/session sur l'API externe. Renvoie la session ou une erreur.

const testSchema = z.object({
  apiKey: z.string().max(500).optional(),
  baseUrl: z.string().url().max(300).optional().or(z.literal('')),
});

router.post(
  '/whatsapp-personal/test',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const body = testSchema.safeParse(req.body ?? {});
      if (!body.success) {
        return res.status(400).json({ success: false, errors: body.error.flatten() });
      }
      const session = await tenantWaSessionService.testConnection(organizationId, body.data);
      res.json({ success: true, data: session });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Échec de la connexion';
      res.status(400).json({ success: false, message });
    }
  },
);

// ── DELETE /whatsapp-personal/config ──────────────────────────────────────────
// Désactive le canal et efface la clé API du tenant.

router.delete(
  '/whatsapp-personal/config',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      await tenantWaSessionService.clearConfig(organizationId);
      res.json({ success: true, message: 'Configuration WhatsApp effacée' });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
