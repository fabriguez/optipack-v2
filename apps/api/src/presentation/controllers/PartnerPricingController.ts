import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { NotFoundError, BusinessError } from '../../domain/errors/BusinessError';

export class PartnerPricingController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;
      const items = await prisma.partnerPricing.findMany({
        where: { clientId },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        include: { transitRoute: { select: { id: true, name: true, type: true } } },
      });
      res.json({ success: true, data: items });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;
      const { transitRouteId, pricePerKg, pricePerVolume, isActive } = req.body as {
        transitRouteId?: string | null;
        pricePerKg: number;
        pricePerVolume?: number;
        isActive?: boolean;
      };

      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, clientType: true } });
      if (!client) throw new NotFoundError('Client', clientId);
      if (client.clientType !== 'PARTNER') {
        throw new BusinessError('Seuls les clients partenaires peuvent avoir une tarification dediee. Changez le type du client.');
      }

      if (transitRouteId) {
        const exists = await prisma.transitRoute.findUnique({ where: { id: transitRouteId } });
        if (!exists) throw new NotFoundError('Route de transit', transitRouteId);
      }

      const created = await prisma.partnerPricing.upsert({
        where: { clientId_transitRouteId: { clientId, transitRouteId: transitRouteId ?? null } as never },
        update: {
          pricePerKg,
          pricePerVolume: pricePerVolume ?? 0,
          isActive: isActive ?? true,
        },
        create: {
          clientId,
          transitRouteId: transitRouteId ?? null,
          pricePerKg,
          pricePerVolume: pricePerVolume ?? 0,
          isActive: isActive ?? true,
        },
      });

      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { pricePerKg, pricePerVolume, isActive } = req.body as {
        pricePerKg?: number;
        pricePerVolume?: number;
        isActive?: boolean;
      };
      const updated = await prisma.partnerPricing.update({
        where: { id },
        data: {
          ...(pricePerKg !== undefined && { pricePerKg }),
          ...(pricePerVolume !== undefined && { pricePerVolume }),
          ...(isActive !== undefined && { isActive }),
        },
      });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      await prisma.partnerPricing.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
