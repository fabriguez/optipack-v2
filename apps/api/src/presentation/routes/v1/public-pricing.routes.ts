import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { validate } from '../../middleware/validate';
import { simulatePriceSchema } from '@transitsoftservices/shared';
import { PricingService } from '../../../application/services/PricingService';

const router = Router();

/**
 * Endpoints PUBLICS (sans auth) du simulateur de prix (site vitrine + app
 * mobile). Convention single-org-per-api : pas de filtre organizationId, on
 * expose les routes de transit actives du tenant courant (cf. public-agencies).
 *
 * Le simulateur est accessible publiquement, mais si la requete porte un token
 * client valide (portail), on applique le tarif partenaire eventuel du client
 * sur la route choisie -- exactement comme CreateParcelUseCase le ferait a la
 * creation d'un colis. Le client non-partenaire (ou anonyme) obtient le tarif
 * standard de la route.
 */

/** Unite de facturation pertinente selon le type de transport. */
function unitForType(type: 'AIR' | 'SEA' | 'LAND'): 'kg' | 'm3' {
  return type === 'SEA' ? 'm3' : 'kg';
}

/**
 * Lit un eventuel token client (portail) sur la requete sans jamais echouer :
 * une requete anonyme reste valide (tarif standard). Renvoie le clientId si le
 * token est un token portail valide, sinon null.
 */
function optionalClientId(authHeader?: string): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = jwt.verify(authHeader.substring(7), config.jwt.secret) as {
      type?: string;
      clientId?: string;
    };
    return payload?.type === 'client' && payload.clientId ? payload.clientId : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/v1/public/transit-routes
 * Routes de transit actives, champs publics uniquement (pour peupler le
 * selecteur du simulateur). Pas de prix masque : les tarifs standards sont
 * publics, le tarif partenaire ne sort que via /simulate-price authentifie.
 */
router.get('/transit-routes', async (_req, res, next) => {
  try {
    const routes = await prisma.transitRoute.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        type: true,
        departureCity: true,
        departureCountry: true,
        arrivalCity: true,
        arrivalCountry: true,
        pricePerKg: true,
        pricePerVolume: true,
        estimatedDurationDays: true,
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    res.json({
      success: true,
      data: routes.map((r) => ({
        ...r,
        pricePerKg: r.pricePerKg != null ? Number(r.pricePerKg) : null,
        pricePerVolume: r.pricePerVolume != null ? Number(r.pricePerVolume) : null,
        unit: unitForType(r.type),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/public/simulate-price
 * Body : { transitRouteId, weight?, volume? }
 * Header optionnel : Authorization Bearer <token client portail>.
 *
 * Renvoie le prix simule + breakdown. Si un token client partenaire est fourni
 * et qu'un tarif partenaire couvre la route, le prix partenaire est applique et
 * l'economie vs tarif standard est exposee.
 */
router.post('/simulate-price', validate(simulatePriceSchema), async (req, res, next) => {
  try {
    const { transitRouteId, weight, volume } = req.body as {
      transitRouteId: string;
      weight?: number;
      volume?: number;
    };

    const route = await prisma.transitRoute.findFirst({
      where: { id: transitRouteId, isActive: true },
    });
    if (!route) {
      return res.status(404).json({ success: false, message: 'Route de transit introuvable' });
    }

    // Regle stricte par type : meme contrat que CreateParcelUseCase.
    const wIn = weight !== undefined && weight !== null && Number(weight) > 0;
    const vIn = volume !== undefined && volume !== null && Number(volume) > 0;
    let hasWeight = false;
    let hasVolume = false;
    if (route.type === 'AIR') {
      if (!wIn) return res.status(400).json({ success: false, message: 'Route aerienne : la masse (kg) est obligatoire.' });
      hasWeight = true;
    } else if (route.type === 'SEA') {
      if (!vIn) return res.status(400).json({ success: false, message: 'Route maritime : le volume (m3) est obligatoire.' });
      hasVolume = true;
    } else {
      if (!wIn || !vIn) return res.status(400).json({ success: false, message: 'Route terrestre : masse et volume obligatoires.' });
      hasWeight = true;
      hasVolume = true;
    }

    // Tarif partenaire : seulement si un token client valide est present et que
    // le client dispose d'une regle active couvrant la route (ou globale).
    const clientId = optionalClientId(req.headers.authorization);
    let partnerPricing = null;
    let isPartner = false;
    if (clientId) {
      const client = await prisma.client.findFirst({
        where: { id: clientId },
        select: { id: true, clientType: true },
      });
      isPartner = client?.clientType === 'PARTNER';
      if (isPartner) {
        partnerPricing = await prisma.partnerPricing.findFirst({
          where: {
            clientId,
            isActive: true,
            OR: [{ transitRouteId: route.id }, { transitRouteId: null }],
          },
          orderBy: { transitRouteId: 'desc' },
        });
      }
    }

    const w = hasWeight ? Number(weight) : 0;
    const v = hasVolume ? Number(volume) : undefined;

    // Prix standard (toujours calcule) + prix effectif (avec tarif partenaire
    // si applicable) pour pouvoir afficher l'economie partenaire.
    const standard = PricingService.calculate(w, v, route, {} as never, null);
    const effective = PricingService.calculate(w, v, route, {} as never, partnerPricing);

    const partnerApplied = effective.breakdown.rateSource === 'partner';
    const savings = partnerApplied ? Math.max(0, standard.finalPrice - effective.finalPrice) : 0;

    res.json({
      success: true,
      data: {
        route: {
          id: route.id,
          name: route.name,
          type: route.type,
          departureCity: route.departureCity,
          departureCountry: route.departureCountry,
          arrivalCity: route.arrivalCity,
          arrivalCountry: route.arrivalCountry,
          estimatedDurationDays: route.estimatedDurationDays,
          unit: unitForType(route.type),
        },
        weight: hasWeight ? w : null,
        volume: hasVolume ? (v ?? null) : null,
        price: effective.finalPrice,
        standardPrice: standard.finalPrice,
        breakdown: effective.breakdown,
        // Contexte client : utile pour l'UI (badge partenaire, incitation login).
        isPartner,
        partnerApplied,
        savings,
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
