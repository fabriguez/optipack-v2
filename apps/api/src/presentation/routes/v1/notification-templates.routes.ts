import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../../../config/database';
import { authenticate, authorize, requirePermission } from '../../middleware/authMiddleware';
import {
  notificationChannelConfigSchema,
  DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
  DEFAULT_NOTIFICATION_GLOBAL_CHANNELS,
  NOTIFICATION_EVENT_REGISTRY,
} from '@transitsoftservices/shared';

const router = Router();
const adminOnly = [authenticate, authorize('SUPER_ADMIN', 'ADMIN')];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getOrgId(req: Request): Promise<string> {
  const orgId = req.user!.organizationId;
  if (!orgId) throw new Error('Utilisateur sans organisation assignée');
  return orgId;
}

// ── GET /notification-config ─────────────────────────────────────────────────
// Config complète : canaux globaux + overrides par event.

router.get(
  '/notification-config',
  ...adminOnly,
  requirePermission('settings.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = await getOrgId(req);
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { notificationConfig: true },
      });
      const parsed = notificationChannelConfigSchema.safeParse(
        org?.notificationConfig ?? DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
      );
      const data = parsed.success ? parsed.data : DEFAULT_NOTIFICATION_CHANNEL_CONFIG;
      // Garantit que channels est toujours présent
      const normalized = {
        channels: data.channels ?? DEFAULT_NOTIFICATION_GLOBAL_CHANNELS,
        events: data.events ?? {},
      };
      res.json({ success: true, data: normalized });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /notification-config/channels ──────────────────────────────────────
// Met à jour les master switches (email/whatsapp/sms/push globalement).

const channelPatchSchema = z.object({
  email: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  sms: z.boolean().optional(),
  push: z.boolean().optional(),
});

router.patch(
  '/notification-config/channels',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = await getOrgId(req);
      const patch = channelPatchSchema.safeParse(req.body);
      if (!patch.success) {
        return res.status(400).json({ success: false, errors: patch.error.flatten() });
      }

      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { notificationConfig: true },
      });
      const existing = notificationChannelConfigSchema.safeParse(
        org?.notificationConfig ?? DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
      );
      const current = existing.success ? existing.data : DEFAULT_NOTIFICATION_CHANNEL_CONFIG;
      const updated = {
        ...current,
        channels: { ...(current.channels ?? DEFAULT_NOTIFICATION_GLOBAL_CHANNELS), ...patch.data },
      };
      await prisma.organization.update({
        where: { id: organizationId },
        data: { notificationConfig: updated },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ── PATCH /notification-config/events/:kind ──────────────────────────────────
// Met à jour les overrides de canaux pour un event spécifique.

const eventChannelPatchSchema = z.object({
  email: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  sms: z.boolean().optional(),
  push: z.boolean().optional(),
});

router.patch(
  '/notification-config/events/:kind',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = await getOrgId(req);
      const { kind } = req.params;

      // Valider que le kind existe
      const validKinds = NOTIFICATION_EVENT_REGISTRY.map((e) => e.kind);
      if (!validKinds.includes(kind)) {
        return res.status(400).json({ success: false, message: `Event kind inconnu : ${kind}` });
      }

      const patch = eventChannelPatchSchema.safeParse(req.body);
      if (!patch.success) {
        return res.status(400).json({ success: false, errors: patch.error.flatten() });
      }

      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { notificationConfig: true },
      });
      const existing = notificationChannelConfigSchema.safeParse(
        org?.notificationConfig ?? DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
      );
      const current = existing.success ? existing.data : DEFAULT_NOTIFICATION_CHANNEL_CONFIG;
      const currentEventConfig = current.events?.[kind] ?? {};
      const updated = {
        ...current,
        events: {
          ...(current.events ?? {}),
          [kind]: { ...currentEventConfig, ...patch.data },
        },
      };
      await prisma.organization.update({
        where: { id: organizationId },
        data: { notificationConfig: updated },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /notification-templates ──────────────────────────────────────────────
// Liste tous les templates personnalisés du tenant.

router.get(
  '/notification-templates',
  ...adminOnly,
  requirePermission('settings.read'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = await getOrgId(req);
      const templates = await prisma.tenantNotificationTemplate.findMany({
        where: { organizationId },
        orderBy: [{ eventKind: 'asc' }, { channel: 'asc' }],
      });
      res.json({ success: true, data: templates });
    } catch (err) {
      next(err);
    }
  },
);

// ── PUT /notification-templates/:eventKind/:channel ──────────────────────────
// Crée ou met à jour le template pour un triplet (org, event, canal).

const templateUpsertSchema = z.object({
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(10000),
  attachments: z.record(z.string(), z.boolean()).optional(),
  isActive: z.boolean().default(true),
});

router.put(
  '/notification-templates/:eventKind/:channel',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = await getOrgId(req);
      const { eventKind, channel } = req.params;

      const validKinds = NOTIFICATION_EVENT_REGISTRY.map((e) => e.kind);
      if (!validKinds.includes(eventKind)) {
        return res.status(400).json({ success: false, message: `Event kind inconnu : ${eventKind}` });
      }
      const validChannels = ['EMAIL', 'WHATSAPP', 'SMS', 'PUSH'];
      if (!validChannels.includes(channel)) {
        return res.status(400).json({ success: false, message: `Canal inconnu : ${channel}` });
      }

      const body = templateUpsertSchema.safeParse(req.body);
      if (!body.success) {
        return res.status(400).json({ success: false, errors: body.error.flatten() });
      }

      const template = await prisma.tenantNotificationTemplate.upsert({
        where: { organizationId_eventKind_channel: { organizationId, eventKind, channel } },
        create: {
          organizationId,
          eventKind,
          channel,
          subject: body.data.subject,
          body: body.data.body,
          attachments: (body.data.attachments ?? undefined) as never,
          isActive: body.data.isActive,
        },
        update: {
          subject: body.data.subject,
          body: body.data.body,
          attachments: (body.data.attachments ?? undefined) as never,
          isActive: body.data.isActive,
        },
      });
      res.json({ success: true, data: template });
    } catch (err) {
      next(err);
    }
  },
);

// ── DELETE /notification-templates/:eventKind/:channel ───────────────────────
// Supprime un template (retour au template système par défaut).

router.delete(
  '/notification-templates/:eventKind/:channel',
  ...adminOnly,
  requirePermission('system.config'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = await getOrgId(req);
      const { eventKind, channel } = req.params;
      await prisma.tenantNotificationTemplate.deleteMany({
        where: { organizationId, eventKind, channel },
      });
      res.json({ success: true, message: 'Template supprimé (retour au défaut système)' });
    } catch (err) {
      next(err);
    }
  },
);

// ── GET /notification-events ─────────────────────────────────────────────────
// Retourne le registre complet des events (pour la UI de config).

router.get(
  '/notification-events',
  authenticate,
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ success: true, data: NOTIFICATION_EVENT_REGISTRY });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
