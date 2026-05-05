import { Router } from 'express';
import { UploadController } from '../../controllers/UploadController';
import { authenticate } from '../../middleware/authMiddleware';
import { uploadImageMiddleware, uploadDocumentMiddleware } from '../../middleware/upload';

const router = Router();

// Toutes les routes uploads necessitent un Bearer token. Le frontend utilise
// AuthedImage / AuthedDownload qui fetch en Authorization: Bearer <token>
// puis creent un blob URL.
router.use(authenticate);

// Sert les objets uploades. Le `*` est obligatoire car la cle MinIO contient
// des slashes : req.params[0] = la cle complete (ex: "uploads/<userId>/<rand>.jpg").
router.get('/object/*', UploadController.getObject);

// Upload generique (recus, justificatifs, preuves de paiement, photos colis, ...)
router.post('/image', uploadImageMiddleware, UploadController.uploadImage);
// Upload generique de fichier (PDF, XLSX, Word, ...)
router.post('/file', uploadDocumentMiddleware, UploadController.uploadFile);

export default router;
