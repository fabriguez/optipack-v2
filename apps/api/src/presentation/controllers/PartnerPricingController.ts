import type { Request, Response, NextFunction } from 'express';
import { checkPricingForType } from '@transitsoftservices/shared';
import { prisma } from '../../config/database';
import { NotFoundError, BusinessError } from '../../domain/errors/BusinessError';
import { realtimeService } from '../../infrastructure/realtime/RealtimeService';
import { clientScope, scopeCtx } from '../../application/services/scope/agencyScope';

export class PartnerPricingController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.params;
      // Scope agence : la tarification est rattachee au client.
      await clientScope.assert(clientId, scopeCtx(req));
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
      await clientScope.assert(clientId, scopeCtx(req));
      const { transitRouteId, pricePerKg, pricePerVolume, isActive } = req.body as {
        transitRouteId: string;
        pricePerKg?: number | null;
        pricePerVolume?: number | null;
        isActive?: boolean;
      };

      const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, clientType: true } });
      if (!client) throw new NotFoundError('Client', clientId);
      if (client.clientType !== 'PARTNER') {
        throw new BusinessError('Seuls les clients partenaires peuvent avoir une tarification dediee. Changez le type du client.');
      }

      // La route est obligatoire : son type (AIR/SEA/LAND) pilote le champ requis.
      const route = await prisma.transitRoute.findUnique({
        where: { id: transitRouteId },
        select: { id: true, type: true },
      });
      if (!route) throw new NotFoundError('Route de transit', transitRouteId);

      const pricingError = checkPricingForType(route.type as 'AIR' | 'SEA' | 'LAND', pricePerKg, pricePerVolume);
      if (pricingError) throw new BusinessError(pricingError);

      // On persiste 0 dans le champ non utilise selon le type : empeche tout
      // calcul de prix dans le mauvais mode cote PricingService.
      const created = await prisma.partnerPricing.upsert({
        where: { clientId_transitRouteId: { clientId, transitRouteId } as never },
        update: {
          pricePerKg: pricePerKg ?? 0,
          pricePerVolume: pricePerVolume ?? 0,
          isActive: isActive ?? true,
        },
        create: {
          clientId,
          transitRouteId,
          pricePerKg: pricePerKg ?? 0,
          pricePerVolume: pricePerVolume ?? 0,
          isActive: isActive ?? true,
        },
      });

      realtimeService.toClient(clientId, 'client:tariffs:updated', {});
      realtimeService.toClient(clientId, 'client:profile:updated', {});

      res.status(201).json({ success: true, data: created });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { pricePerKg, pricePerVolume, isActive } = req.body as {
        pricePerKg?: number | null;
        pricePerVolume?: number | null;
        isActive?: boolean;
      };

      const existing = await prisma.partnerPricing.findUnique({
        where: { id },
        include: { transitRoute: { select: { type: true } } },
      });
      if (!existing) throw new NotFoundError('Tarification partenaire', id);

      // Revalide la combinaison kg/m3 selon le type de la route, en tenant
      // compte des valeurs deja en base pour les champs non fournis.
      const nextKg = pricePerKg !== undefined ? pricePerKg : Number(existing.pricePerKg);
      const nextVol = pricePerVolume !== undefined ? pricePerVolume : Number(existing.pricePerVolume);
      const routeType = existing.transitRoute?.type as 'AIR' | 'SEA' | 'LAND' | undefined;
      const pricingError = checkPricingForType(routeType, nextKg, nextVol);
      if (pricingError) throw new BusinessError(pricingError);

      const updated = await prisma.partnerPricing.update({
        where: { id },
        data: {
          ...(pricePerKg !== undefined && { pricePerKg: pricePerKg ?? 0 }),
          ...(pricePerVolume !== undefined && { pricePerVolume: pricePerVolume ?? 0 }),
          ...(isActive !== undefined && { isActive }),
        },
      });

      realtimeService.toClient(existing.clientId, 'client:tariffs:updated', {});

      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const deleted = await prisma.partnerPricing.delete({ where: { id: req.params.id } });
      realtimeService.toClient(deleted.clientId, 'client:tariffs:updated', {});
      realtimeService.toClient(deleted.clientId, 'client:profile:updated', {});
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
}
