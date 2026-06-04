import { Router } from 'express';
import { UploadController } from '../../controllers/UploadController';
import { authenticate, authenticateUserOrClient } from '../../middleware/authMiddleware';
import { uploadImageMiddleware, uploadDocumentMiddleware } from '../../middleware/upload';

const router = Router();

// Sert les objets uploades. Le `*` est obligatoire car la cle MinIO contient
// des slashes : req.params[0] = la cle complete (ex: "uploads/<userId>/<rand>.jpg").
// Lecture accessible au STAFF *et* au portail client (le mobile affiche les
// photos de colis via AuthedImage avec son token client). Le prefixe `uploads/`
// reste verifie dans le controller pour borner l'acces au bucket.
router.get('/object/*', authenticateUserOrClient, UploadController.getObject);

// Ecritures : staff uniquement (Bearer token back-office).
// Upload generique (recus, justificatifs, preuves de paiement, photos colis, ...)
router.post('/image', authenticate, uploadImageMiddleware, UploadController.uploadImage);
// Upload generique de fichier (PDF, XLSX, Word, ...)
router.post('/file', authenticate, uploadDocumentMiddleware, UploadController.uploadFile);

export default router;
