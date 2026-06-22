import { Router } from 'express';
import { UploadController } from '../../controllers/UploadController';
import { authenticate, authenticateUserOrClient } from '../../middleware/authMiddleware';
import { uploadImageMiddleware, uploadDocumentMiddleware } from '../../middleware/upload';
import { prisma } from '../../../config/database';
import { container } from '../../../container';
import { StorageService } from '../../../infrastructure/storage/StorageService';

const router = Router();

// PUBLIC : logo du tenant, sans auth. Affiche sur login page, emails, mobile,
// tablette — tous contextes sans token. Seul le orgId (non secret) est expose.
router.get('/public-logo/:orgId', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId },
      select: { logoUrl: true },
    });
    if (!org?.logoUrl) return res.status(404).end();

    // Extrait la cle MinIO depuis l'URL stockee.
    // Format : https://host/api/v1/uploads/object/<key>  ou  /api/v1/uploads/object/<key>
    const marker = '/uploads/object/';
    const idx = org.logoUrl.indexOf(marker);
    let key: string;
    try {
      key = decodeURIComponent(idx !== -1 ? org.logoUrl.slice(idx + marker.length) : org.logoUrl);
    } catch {
      key = idx !== -1 ? org.logoUrl.slice(idx + marker.length) : org.logoUrl;
    }

    if (!key.startsWith('uploads/')) return res.status(404).end();

    const storage = container.resolve(StorageService);
    const obj = await storage.getObject(key);
    if (!obj) return res.status(404).end();

    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Content-Length', String(obj.size));
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    obj.stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

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
