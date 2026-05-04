import { Router } from 'express';
import { EmployeeController } from '../../controllers/EmployeeController';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { validate } from '../../middleware/validate';
import { uploadImageMiddleware } from '../../middleware/upload';
import { paginationSchema } from '@transitsoftservices/shared';

const router = Router();

// Endpoint PUBLIC : sert les photos employes pour <img src>. Doit etre AVANT authenticate.
router.get('/:id/image/:slot', EmployeeController.getImage);

router.use(authenticate);
router.use(authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/', validate(paginationSchema, 'query'), EmployeeController.listAll);
router.get('/agency/:agencyId', validate(paginationSchema, 'query'), EmployeeController.list);
router.get('/:id', EmployeeController.getById);
router.post('/', EmployeeController.create);
router.patch('/:id', EmployeeController.update);
router.delete('/:id', EmployeeController.delete);

// Photo upload / delete (auth requise). slot in {selfie, locationPlan, idDocument}.
router.post('/:id/image/:slot', uploadImageMiddleware, EmployeeController.uploadImage);
router.delete('/:id/image/:slot', EmployeeController.deleteImage);

export default router;
