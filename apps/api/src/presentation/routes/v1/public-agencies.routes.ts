import { Router } from 'express';
import { prisma } from '../../../config/database';

const router = Router();

/**
 * Endpoints PUBLICS (sans auth) pour le listing des agences sur le site
 * vitrine. Convention single-org-per-api : pas de filtre organizationId,
 * on expose les agences actives du tenant courant (cf. public-tracking).
 *
 * Champs non sensibles uniquement : coordonnees commerciales + image +
 * lien Google Maps. Pas de responsibleUserId, imageKey, timezone interne.
 */

/**
 * GET /api/v1/public/agencies
 * Liste des agences actives (vitrine publique).
 */
router.get('/agencies', async (_req, res, next) => {
  try {
    const agencies = await prisma.agency.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        imageUrl: true,
        googleMapsLink: true,
      },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });

    res.json({ success: true, data: agencies });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/agencies/:id
 * Detail d'une agence active + horaires d'ouverture.
 */
router.get('/agencies/:id', async (req, res, next) => {
  try {
    const id = req.params.id?.trim();
    if (!id) {
      return res.status(400).json({ success: false, message: 'Identifiant requis' });
    }

    const agency = await prisma.agency.findFirst({
      where: { id, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        address: true,
        city: true,
        country: true,
        phone: true,
        email: true,
        imageUrl: true,
        googleMapsLink: true,
        openingHours: {
          where: { isOpen: true },
          select: { dayOfWeek: true, openTime: true, closeTime: true },
          orderBy: [{ dayOfWeek: 'asc' }, { openTime: 'asc' }],
        },
      },
    });

    if (!agency) {
      return res.status(404).json({ success: false, message: 'Agence introuvable' });
    }

    res.json({ success: true, data: agency });
  } catch (err) {
    next(err);
  }
});

export default router;
