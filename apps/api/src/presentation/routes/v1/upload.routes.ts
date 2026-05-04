import { Router } from 'express';
import { UploadController } from '../../controllers/UploadController';
import { authenticate } from '../../middleware/authMiddleware';
import { uploadImageMiddleware } from '../../middleware/upload';

const router = Router();

// Public : sert les objets uploades pour <img src>.
router.get('/object/:key', UploadController.getObject);

router.use(authenticate);

// Upload generique (recus, justificatifs, preuves de paiement, photos colis, ...)
router.post('/image', uploadImageMiddleware, UploadController.uploadImage);

export default router;
