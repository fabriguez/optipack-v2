import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError } from '../../domain/errors/BusinessError';
import {
  notificationChannelConfigSchema,
  DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
} from '@transitsoftservices/shared';

export class ConfigController {
  /**
   * GET /config
   * List all system configs for the user's organization.
   */
  static async listConfigs(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = await ConfigController.getOrganizationId(req);

      const configs = await prisma.systemConfig.findMany({
        where: { organizationId },
        orderBy: { key: 'asc' },
      });

      res.json({ success: true, data: configs });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PUT /config/:key
   * Update a system config value.
   */
  static async updateConfig(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = await ConfigController.getOrganizationId(req);
      const { key } = req.params;
      const { value } = req.body;

      const config = await prisma.systemConfig.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value: String(value) },
        create: { organizationId, key, value: String(value) },
      });

      res.json({ success: true, data: config });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /currencies
   * List all currencies for the user's organization.
   */
  static async listCurrencies(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = await ConfigController.getOrganizationId(req);

      const currencies = await prisma.currency.findMany({
        where: { organizationId },
        orderBy: [{ isBase: 'desc' }, { code: 'asc' }],
      });

      res.json({ success: true, data: currencies });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /currencies
   * Create a new currency.
   */
  static async createCurrency(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = await ConfigController.getOrganizationId(req);
      const { code, name, symbol, exchangeRate, isBase } = req.body;

      // If this currency is set as base, unset others
      if (isBase) {
        await prisma.currency.updateMany({
          where: { organizationId, isBase: true },
          data: { isBase: false },
        });
      }

      const currency = await prisma.currency.create({
        data: {
          organizationId,
          code,
          name,
          symbol,
          exchangeRate,
          isBase: isBase ?? false,
        },
      });

      res.status(201).json({ success: true, data: currency });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /currencies/:id
   * Update an existing currency.
   */
  static async updateCurrency(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = await ConfigController.getOrganizationId(req);
      const { id } = req.params;
      const { code, name, symbol, exchangeRate, isBase, isActive } = req.body;

      const existing = await prisma.currency.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new NotFoundError('Devise', id);

      // If setting as base, unset others
      if (isBase) {
        await prisma.currency.updateMany({
          where: { organizationId, isBase: true, id: { not: id } },
          data: { isBase: false },
        });
      }

      const currency = await prisma.currency.update({
        where: { id },
        data: {
          ...(code !== undefined && { code }),
          ...(name !== undefined && { name }),
          ...(symbol !== undefined && { symbol }),
          ...(exchangeRate !== undefined && { exchangeRate }),
          ...(isBase !== undefined && { isBase }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      res.json({ success: true, data: currency });
    } catch (err) {
      next(err);
    }
  }

  /**
   * DELETE /currencies/:id
   * Delete a currency (only if not the base currency).
   */
  static async deleteCurrency(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = await ConfigController.getOrganizationId(req);
      const { id } = req.params;

      const existing = await prisma.currency.findFirst({
        where: { id, organizationId },
      });
      if (!existing) throw new NotFoundError('Devise', id);

      if (existing.isBase) {
        return res.status(400).json({
          success: false,
          message: 'Impossible de supprimer la devise de base',
        });
      }

      await prisma.currency.delete({ where: { id } });

      res.json({ success: true, message: 'Devise supprimee' });
    } catch (err) {
      next(err);
    }
  }

  /**
   * GET /notification-channels
   * Retourne la config des canaux de notification du tenant.
   */
  static async getNotificationChannels(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = await ConfigController.getOrganizationId(req);
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { notificationConfig: true },
      });
      const raw = org?.notificationConfig ?? null;
      const parsed = notificationChannelConfigSchema.safeParse(raw ?? DEFAULT_NOTIFICATION_CHANNEL_CONFIG);
      const data = parsed.success ? parsed.data : DEFAULT_NOTIFICATION_CHANNEL_CONFIG;
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  /**
   * PATCH /notification-channels
   * Active ou desactive des canaux de notification pour le tenant.
   * Body : { email?: boolean, whatsapp?: boolean, sms?: boolean }
   */
  static async updateNotificationChannels(req: Request, res: Response, next: NextFunction) {
    try {
      const organizationId = await ConfigController.getOrganizationId(req);
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { notificationConfig: true },
      });
      const existing = notificationChannelConfigSchema.safeParse(
        org?.notificationConfig ?? DEFAULT_NOTIFICATION_CHANNEL_CONFIG,
      );
      const current = existing.success ? existing.data : DEFAULT_NOTIFICATION_CHANNEL_CONFIG;

      const patch = notificationChannelConfigSchema.partial().safeParse(req.body);
      if (!patch.success) {
        return res.status(400).json({ success: false, message: 'Body invalide', errors: patch.error.flatten() });
      }

      const updated = { ...current, ...patch.data };
      await prisma.organization.update({
        where: { id: organizationId },
        data: { notificationConfig: updated },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Resout l'organizationId. Priorite au champ porte par le JWT (present pour
   * TOUS les users, y compris owner/SUPER_ADMIN sans agence). On ne retombe sur
   * la 1ere agence que pour d'eventuels vieux tokens sans organizationId.
   * Avant : on derivait uniquement de agencyIds[0] -> un owner sans agence
   * faisait planter /config en 500 ("Utilisateur sans agence assignee").
   */
  private static async getOrganizationId(req: Request): Promise<string> {
    const orgId = req.user?.organizationId;
    if (orgId) return orgId;

    const agencyIds = req.user?.agencyIds ?? [];
    if (!agencyIds.length) {
      throw new Error('Utilisateur sans organisation ni agence assignee');
    }

    const agency = await prisma.agency.findUnique({
      where: { id: agencyIds[0] },
      select: { organizationId: true },
    });

    if (!agency) {
      throw new Error('Agence introuvable');
    }

    return agency.organizationId;
  }
}
