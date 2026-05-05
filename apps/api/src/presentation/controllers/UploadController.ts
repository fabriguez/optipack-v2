import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { StorageService } from '../../infrastructure/storage/StorageService';
import { extFromMime } from '../middleware/upload';
import { prisma } from '../../config/database';

/**
 * Upload generique d'image (recus, justificatifs, preuves de paiement, ...).
 * Stocke l'objet dans MinIO sous le prefixe `uploads/<userId>/<orgId>/`
 * et renvoie une URL servie par /api/v1/uploads/:key.
 *
 * Le binding URL <-> objet est conserve cote front : la valeur retournee est
 * stockee directement dans le champ proofUrl/receiptUrl/... de l'entite.
 */
export class UploadController {
  static async uploadImage(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });

      const storage = container.resolve(StorageService);
      const ext = extFromMime(file.mimetype);
      const userId = req.user?.userId || 'anon';
      const key = storage.buildKey(`uploads/${userId}`, ext);
      await storage.uploadBuffer(key, file.buffer, file.mimetype);

      // Trace minimale pour pouvoir purger / auditer si besoin (best-effort).
      // On evite un nouveau modele Prisma : on s'appuie sur la cle pour la URL.
      const url = `/api/v1/uploads/object/${encodeURIComponent(key)}`;

      res.json({ success: true, data: { url, key, contentType: file.mimetype, size: file.size } });
    } catch (err) {
      next(err);
    }
  }

  static async uploadFile(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });

      const storage = container.resolve(StorageService);
      const ext = extFromMime(file.mimetype);
      const userId = req.user?.userId || 'anon';
      const key = storage.buildKey(`uploads/${userId}`, ext);
      await storage.uploadBuffer(key, file.buffer, file.mimetype);

      const url = `/api/v1/uploads/object/${encodeURIComponent(key)}`;
      res.json({
        success: true,
        data: { url, key, contentType: file.mimetype, size: file.size, fileName: file.originalname },
      });
    } catch (err) {
      next(err);
    }
  }

  static async getObject(req: Request, res: Response, next: NextFunction) {
    try {
      const key = decodeURIComponent(req.params.key);
      // Securite : le prefixe `uploads/` est obligatoire pour eviter de servir
      // n'importe quel objet du bucket via cette route.
      if (!key.startsWith('uploads/')) {
        return res.status(404).end();
      }
      const storage = container.resolve(StorageService);
      const obj = await storage.getObject(key);
      if (!obj) return res.status(404).end();
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Content-Length', String(obj.size));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      obj.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
}

// Suppress unused prisma import lint (kept here for future audit logging hook)
void prisma;
