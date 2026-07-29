/**
 * Endpoint PUBLIC (sans auth) listant les codes promo en cours du tenant, pour
 * la page "Promotions" du site vitrine. Convention single-org-per-api : pas de
 * filtre organizationId, on expose ce que le tenant courant a publie
 * (cf. public-agencies / public-pricing).
 *
 * Seuls les codes `visibility = PUBLIC` sortent ici : un code PRIVATE reste
 * utilisable mais n'est jamais liste, un code ASSIGNED n'est visible que dans
 * l'espace du client concerne. Aucun compteur d'usage n'est expose (on ne
 * renseigne pas la concurrence sur le volume consomme), seulement le fait qu'il
 * reste ou non des utilisations disponibles.
 */
import { Router } from 'express';
import { prisma } from '../../../config/database';

const router = Router();

router.get('/promo-codes', async (_req, res, next) => {
  try {
    const now = new Date();
    const promos = await prisma.promoCode.findMany({
      where: {
        visibility: 'PUBLIC',
        isActive: true,
        isDeleted: false,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
      },
      select: {
        id: true,
        code: true,
        label: true,
        description: true,
        discountType: true,
        discountValue: true,
        maxDiscountAmount: true,
        minOrderAmount: true,
        maxOrderAmount: true,
        parcelCategories: true,
        transitTypes: true,
        startsAt: true,
        expiresAt: true,
        maxUses: true,
        usedCount: true,
        maxUsesPerClient: true,
        routes: {
          select: {
            transitRoute: {
              select: {
                id: true,
                name: true,
                type: true,
                departureCity: true,
                arrivalCity: true,
              },
            },
          },
        },
      },
      orderBy: [{ expiresAt: 'asc' }, { createdAt: 'desc' }],
    });

    const data = promos
      // Un code dont le quota global est epuise n'a plus d'interet a etre
      // affiche : on le retire plutot que de laisser le client se heurter au
      // refus au moment de payer.
      .filter((p) => p.maxUses == null || p.usedCount < p.maxUses)
      .map(({ maxUses, usedCount, routes, ...rest }) => ({
        ...rest,
        routes: routes.map((r) => r.transitRoute),
        isLimited: maxUses != null,
        remainingUses: maxUses == null ? null : Math.max(0, maxUses - usedCount),
      }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
