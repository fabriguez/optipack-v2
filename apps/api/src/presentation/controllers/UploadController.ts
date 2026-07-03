import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { StorageService } from '../../infrastructure/storage/StorageService';
import { extFromMime, isSafeInlineImage } from '../middleware/upload';
import { config } from '../../config';
import { prisma } from '../../config/database';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('UploadController');

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
  const usedEnv = !!(fromEnv && /^https?:\/\//i.test(fromEnv));
  // Fallback : derive from request (utile en dev quand API_URL n'est pas posee)
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const reqHost = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  const url = usedEnv ? `${fromEnv!.replace(/\/$/, '')}${path}` : `${proto}://${reqHost}${path}`;
  // Log la resolution du host de l'URL : c'est ici qu'on diagnostique une URL
  // qui sortirait avec un host interne (ex minio:9000) ou un API_URL mal pose.
  logger.info(
    {
      key,
      url,
      hostSource: usedEnv ? 'API_URL' : 'request',
      apiUrlEnv: fromEnv || null,
      xForwardedHost: (req.headers['x-forwarded-host'] as string) || null,
      reqHost: req.get('host') || null,
    },
    '[upload] resolved object URL',
  );
  return url;
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
      const orgId = req.user?.organizationId ?? '';
      const key = storage.buildKey(`uploads/${userId}`, ext);
      logger.info(
        { kind: 'image', key, originalname: file.originalname, mimetype: file.mimetype, size: file.size, userId, orgId },
        '[upload] received',
      );
      await storage.uploadBuffer(key, file.buffer, file.mimetype);

      // ABAC : enregistre la propriete de l objet pour scoping acces.
      await prisma.uploadObject.create({
        data: { key, organizationId: orgId, uploadedById: userId, uploadedByType: 'USER' },
      }).catch((err) => logger.warn({ err, key }, 'Failed to record upload ownership'));

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
      const orgId = req.user?.organizationId ?? '';
      const key = storage.buildKey(`uploads/${userId}`, ext);
      logger.info(
        { kind: 'file', key, originalname: file.originalname, mimetype: file.mimetype, size: file.size, userId, orgId },
        '[upload] received',
      );
      await storage.uploadBuffer(key, file.buffer, file.mimetype);

      // ABAC : enregistre la propriete de l objet pour scoping acces.
      await prisma.uploadObject.create({
        data: { key, organizationId: orgId, uploadedById: userId, uploadedByType: 'USER' },
      }).catch((err) => logger.warn({ err, key }, 'Failed to record upload ownership'));

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

      // ABAC Phase 2 : scoping objet par organisation.
      // Si un enregistrement existe, on verifie que le demandeur appartient a la meme org.
      // Si aucun enregistrement (cle anterieure) : acces tolere avec warning (backward compat).
      const record = await prisma.uploadObject.findUnique({
        where: { key },
        select: { organizationId: true },
      });
      if (record) {
        const requesterOrgId =
          req.user?.organizationId ??
          (req as any).clientPortal?.organizationId ??
          null;
        if (!requesterOrgId || requesterOrgId !== record.organizationId) {
          logger.warn({ key, requesterOrgId, ownerOrgId: record.organizationId }, 'Upload access denied — org mismatch');
          return res.status(403).end();
        }
      } else {
        logger.warn({ key }, 'Upload object without ownership record — allowing (legacy)');
      }

      const storage = container.resolve(StorageService);
      const obj = await storage.getObject(key);
      if (!obj) return res.status(404).end();
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Content-Length', String(obj.size));
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // Securite : empeche le sniffing MIME (helmet le pose globalement, mais on
      // le reaffirme ici car on pipe des octets bruts).
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Securite : seuls les formats image surs sont servis inline. Tout autre
      // content-type (svg, html, ...) est force en telechargement pour eviter
      // qu'une navigation top-level execute du script (stored-XSS).
      if (!isSafeInlineImage(obj.contentType)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
      obj.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }
}
