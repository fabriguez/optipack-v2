import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { StorageService } from '../../infrastructure/storage/StorageService';
import { extFromMime } from '../middleware/upload';
import { config } from '../../config';
import { prisma } from '../../config/database';

/**
 * Construit l'URL absolue d'un objet uploade. Prefere config.apiUrl (env API_URL),
 * sinon utilise l'origine de la requete (req.protocol + req.host) pour rester
 * fonctionnel meme si l'env n'est pas posee.
 */
function buildAbsoluteUrl(req: Request, key: string): string {
  // On encode chaque segment individuellement (pour preserver les slashes
  // separateurs) plutot que toute la cle d'un coup avec encodeURIComponent
  // (qui transformerait les / en %2F et casserait certains reverse proxies).
  const safeKey = key.split('/').map(encodeURIComponent).join('/');
  const path = `/api/v1/uploads/object/${safeKey}`;
  const fromEnv = config.apiUrl;
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return `${fromEnv.replace(/\/$/, '')}${path}`;
  }
  // Fallback : derive from request (utile en dev quand API_URL n'est pas posee)
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}${path}`;
}

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

      const url = buildAbsoluteUrl(req, key);
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

      const url = buildAbsoluteUrl(req, key);
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
      // La route est /object/* -> req.params[0] = la cle complete (avec slashes).
      // En fallback (au cas ou Express decoderait differemment), on lit aussi req.params.key.
      const raw = (req.params as any)[0] ?? (req.params as any).key ?? '';
      let key: string;
      try {
        key = decodeURIComponent(raw);
      } catch {
        key = raw;
      }
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
