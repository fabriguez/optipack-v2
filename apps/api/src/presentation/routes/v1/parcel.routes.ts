import { Router } from 'express';
import { ParcelController } from '../../controllers/ParcelController';
import { authenticate } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { createParcelSchema, paginationSchema } from '@optipack/shared';
import { prisma } from '../../../config/database';

const router = Router();

router.use(authenticate);

router.get('/', validate(paginationSchema, 'query'), ParcelController.list);
router.get('/tracking/:tracking', ParcelController.getByTracking);
router.get('/:id', ParcelController.getById);
router.post('/', validate(createParcelSchema), ParcelController.create);
router.patch('/:id/status', ParcelController.updateStatus);

// Historique complet d'un colis
router.get('/:id/history', async (req, res, next) => {
  try {
    const history = await prisma.parcelHistory.findMany({
      where: { parcelId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json({ success: true, data: history });
  } catch (err) {
    next(err);
  }
});

export default router;
