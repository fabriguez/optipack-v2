import { Router } from 'express';
import { prisma } from '../../../config/database';

const router = Router();

/**
 * Endpoint PUBLIC (sans auth) pour le suivi de colis via QR code.
 * Le QR encode l'URL du frontend `/tracking/<trackingNumber>` qui consomme
 * cet endpoint pour afficher l'etat du colis a un destinataire qui scanne
 * avec l'appareil photo de son telephone.
 *
 * Expose uniquement des champs non sensibles : pas de telephone client,
 * pas de prix, pas d'adresse complete.
 */
router.get('/tracking/:tracking', async (req, res, next) => {
  try {
    const tracking = req.params.tracking?.trim();
    if (!tracking) {
      return res.status(400).json({ success: false, message: 'Tracking number requis' });
    }

    const parcel = await prisma.parcel.findFirst({
      where: { trackingNumber: tracking, isDeleted: false },
      select: {
        trackingNumber: true,
        designation: true,
        status: true,
        isPresent: true,
        destination: true,
        destinationAddress: true,
        createdAt: true,
        arrivalDate: true,
        pickupDate: true,
        warehouseEnteredAt: true,
        category: true,
        warehouse: { select: { name: true, agency: { select: { name: true, city: true } } } },
        destinationAgency: { select: { name: true, city: true } },
        transitRoute: { select: { name: true, type: true } },
      },
    });

    if (!parcel) {
      return res.status(404).json({ success: false, message: 'Colis introuvable' });
    }

    res.json({ success: true, data: parcel });
  } catch (err) {
    next(err);
  }
});

export default router;
