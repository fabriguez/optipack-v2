import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import { tenantWaSessionService } from '../../../application/services/whatsapp/TenantWhatsAppSessionService';
import { realtimeService } from '../../../infrastructure/realtime/RealtimeService';

const router = Router();
const adminOnly = [authenticate, authorize('SUPER_ADMIN', 'ADMIN')];

function getOrgId(req: Request): string {
  const orgId = req.user!.organizationId;
  if (!orgId) throw new Error('Utilisateur sans organisation assignée');
  return orgId;
}

// ── GET /whatsapp-personal/status ─────────────────────────────────────────────
// Retourne l'état courant de la session WA du tenant.

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

// ── POST /whatsapp-personal/start ─────────────────────────────────────────────
// Démarre une session (génère un QR si pas encore connecté).
// Best-effort : ne bloque pas la réponse, le QR est émis via socket.

router.post(
  '/whatsapp-personal/start',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);

      // Écoute une fois le QR pour l'envoyer aussi via socket org
      const onQr = (qrDataUrl: string) => {
        realtimeService.toOrganization(organizationId, 'whatsapp:qr', { qrCode: qrDataUrl });
      };
      const onReady = (phone: string | null) => {
        realtimeService.toOrganization(organizationId, 'whatsapp:status', {
          status: 'CONNECTED',
          connectedPhone: phone,
        });
      };
      const onDisconnected = (reason: string) => {
        realtimeService.toOrganization(organizationId, 'whatsapp:status', {
          status: 'DISCONNECTED',
          reason,
        });
      };

      tenantWaSessionService.once(`qr:${organizationId}`, onQr);
      tenantWaSessionService.once(`ready:${organizationId}`, onReady);
      tenantWaSessionService.once(`disconnected:${organizationId}`, onDisconnected);

      // Fire and forget (puppeteer prend du temps)
      tenantWaSessionService.startSession(organizationId).catch(() => {
        realtimeService.toOrganization(organizationId, 'whatsapp:status', { status: 'DISCONNECTED' });
      });

      res.json({ success: true, message: 'Session en cours de démarrage. QR code disponible sous peu.' });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /whatsapp-personal/disconnect ──────────────────────────────────────
// Déconnecte et supprime la session WA du tenant.

router.delete(
  '/whatsapp-personal/disconnect',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      await tenantWaSessionService.destroySession(organizationId);
      realtimeService.toOrganization(organizationId, 'whatsapp:status', { status: 'DISCONNECTED' });
      res.json({ success: true, message: 'Session WhatsApp déconnectée' });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /whatsapp-personal/rate-limit ───────────────────────────────────────
// Met à jour le rate limit (X/h + délai min en secondes).

const rateLimitSchema = z.object({
  perHour: z.number().int().min(1).max(500),
  minDelaySeconds: z.number().int().min(0).max(60),
});

router.patch(
  '/whatsapp-personal/rate-limit',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = getOrgId(req);
      const body = rateLimitSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ success: false, errors: body.error.flatten() });
      }
      await tenantWaSessionService.updateRateLimit(
        organizationId,
        body.data.perHour,
        body.data.minDelaySeconds,
      );
      res.json({ success: true, data: body.data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
