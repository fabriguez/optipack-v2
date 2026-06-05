import { Router } from 'express';
import { container } from '../../../container';
import { prisma } from '../../../config/database';
import { StorageService } from '../../../infrastructure/storage/StorageService';

const router = Router();

/**
 * Reecrit l'imageUrl agence (qui pointe vers l'endpoint PROTEGE
 * `/api/v1/agencies/:id/image`) vers l'endpoint PUBLIC equivalent, afin que les
 * pages vitrine (sans token) puissent afficher l'image via un simple <img>.
 */
function toPublicImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null;
  return imageUrl.replace('/api/v1/agencies/', '/api/v1/public/agencies/');
}

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

    res.json({
      success: true,
      data: agencies.map((a) => ({ ...a, imageUrl: toPublicImageUrl(a.imageUrl) })),
    });
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

    res.json({ success: true, data: { ...agency, imageUrl: toPublicImageUrl(agency.imageUrl) } });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/public/agencies/:id/image
 * Image vitrine d'une agence active, sans auth (consommee par <img> sur le site
 * public). Stream direct depuis le storage, CORP cross-origin pour autoriser
 * l'affichage depuis l'origine frontend.
 */
router.get('/agencies/:id/image', async (req, res, next) => {
  try {
    const agency = await prisma.agency.findFirst({
      where: { id: req.params.id, isActive: true },
      select: { imageKey: true },
    });
    if (!agency?.imageKey) {
      return res.status(404).json({ success: false, message: 'Image introuvable' });
    }
    const storage = container.resolve(StorageService);
    const obj = await storage.getObject(agency.imageKey);
    if (!obj) {
      return res.status(404).json({ success: false, message: 'Image introuvable' });
    }
    res.set({
      'Content-Type': obj.contentType,
      'Content-Length': String(obj.size),
      'Cache-Control': 'public, max-age=3600',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    obj.stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

export default router;
