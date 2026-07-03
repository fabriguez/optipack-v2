import { Router } from 'express';
import type { Request } from 'express';
import { UploadController } from '../../controllers/UploadController';
import { authenticate, authenticateUserOrClient } from '../../middleware/authMiddleware';
import { uploadImageMiddleware, uploadDocumentMiddleware, extFromMime, isSafeInlineImage } from '../../middleware/upload';
import { prisma } from '../../../config/database';
import { container } from '../../../container';
import { config } from '../../../config';
import { StorageService } from '../../../infrastructure/storage/StorageService';

const router = Router();

/** Valide le service-token partage ops <-> tenant (cf tenant-meta ops-sync). */
function hasServiceToken(req: Request): boolean {
  const expected = process.env.OPS_TENANT_PROXY_TOKEN ?? '';
  return !!expected && req.headers['x-service-token'] === expected;
}

/**
 * URL a stocker en org.logoUrl pour un objet public deja uploade.
 * - Si MINIO_PUBLIC_BASE_URL est defini -> URL directe s3 (sans proxy, sans token,
 *   necessite un sous-domaine s3 public avec cert valide).
 * - Sinon -> URL absolue vers la route publique sans auth /api/v1/uploads/public/<rest>
 *   (l'API stream l'octet, CORP cross-origin). Fallback robuste qui NE depend PAS
 *   du sous-domaine s3. La cle est sous public/<rest> -> on n'expose que <rest>.
 */
function publicAssetUrl(req: Request, storage: StorageService, key: string): string {
  const direct = storage.publicUrl(key);
  if (direct) return direct;
  const rest = key.startsWith(StorageService.PUBLIC_PREFIX)
    ? key.slice(StorageService.PUBLIC_PREFIX.length)
    : key;
  const safeRest = rest.split('/').map(encodeURIComponent).join('/');
  const path = `/api/v1/uploads/public/${safeRest}`;
  const apiBase = config.apiUrl && /^https?:\/\//i.test(config.apiUrl) ? config.apiUrl.replace(/\/$/, '') : '';
  if (apiBase) return `${apiBase}${path}`;
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}${path}`;
}

// PUBLIC : sert n'importe quel objet sous le prefixe public/ SANS auth (logos,
// assets de marque). Le bucket autorise deja la lecture anonyme sur public/*
// (cf minio.ts) ; cette route permet de servir l'asset meme sans sous-domaine
// s3 public / cert (fallback robuste). Le `*` capture la cle apres public/.
// Borne stricte au prefixe public/ -> aucun acces aux objets prives uploads/.
router.get('/public/*', async (req, res, next) => {
  try {
    const rest = (req.params as any)[0] ?? '';
    let key: string;
    try {
      key = `${StorageService.PUBLIC_PREFIX}${decodeURIComponent(rest)}`;
    } catch {
      key = `${StorageService.PUBLIC_PREFIX}${rest}`;
    }
    if (!key.startsWith(StorageService.PUBLIC_PREFIX) || key.includes('..')) {
      return res.status(404).end();
    }
    const storage = container.resolve(StorageService);
    const obj = await storage.getObject(key);
    if (!obj) return res.status(404).end();
    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Content-Length', String(obj.size));
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!isSafeInlineImage(obj.contentType)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
    obj.stream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// PUBLIC : logo du tenant, sans auth. Affiche sur login page, emails, mobile,
// tablette — tous contextes sans token. Seul le orgId (non secret) est expose.
router.get('/public-logo/:orgId', async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.orgId },
      select: { logoUrl: true },
    });
    if (!org?.logoUrl) return res.status(404).end();

    // Data URL base64 (ex: logo pousse depuis l'ops-admin Studio, qui n'a pas
    // d'object storage). On decode et on sert les octets nous-memes, comme une
    // image normale, pour que login/favicon/sidebar/site web l'affichent sans
    // token et sans blocage CORP.
    const dataUrlMatch = /^data:([^;,]+)?(;base64)?,(.*)$/is.exec(org.logoUrl);
    if (dataUrlMatch) {
      const contentType = dataUrlMatch[1] || 'application/octet-stream';
      const isBase64 = Boolean(dataUrlMatch[2]);
      const payload = dataUrlMatch[3] ?? '';
      const buf = isBase64
        ? Buffer.from(payload, 'base64')
        : Buffer.from(decodeURIComponent(payload), 'utf-8');
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', String(buf.length));
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      // Le content-type provient de la data URL (controle utilisateur) : on force
      // le telechargement si ce n'est pas un format image sur (svg/html -> XSS).
      if (!isSafeInlineImage(contentType)) {
        res.setHeader('Content-Disposition', 'attachment');
      }
      return res.end(buf);
    }

    // URL externe absolue TIERCE (CDN/S3 public d'un autre domaine) : on redirige.
    // MAIS pas nos propres endpoints : ni le proxy public-logo (boucle infinie),
    // ni /uploads/object/ (protege par auth -> 401 + CORP same-origin cote img).
    // Pour ces deux cas on tombe dans l'extraction de cle + stream ci-dessous,
    // afin de servir les octets nous-memes avec CORP cross-origin (login page,
    // favicon, site web, sidebar -- tous contextes sans token).
    if (/^https?:\/\//i.test(org.logoUrl)) {
      const isOurApi =
        org.logoUrl.includes('/api/v1/uploads/public-logo/') ||
        org.logoUrl.includes('/uploads/object/');
      if (!isOurApi) {
        res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        return res.redirect(301, org.logoUrl);
      }
    }

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

    if (!key.startsWith('uploads/') && !key.startsWith('public/')) return res.status(404).end();

    const storage = container.resolve(StorageService);
    const obj = await storage.getObject(key);
    if (!obj) return res.status(404).end();

    res.setHeader('Content-Type', obj.contentType);
    res.setHeader('Content-Length', String(obj.size));
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!isSafeInlineImage(obj.contentType)) {
      res.setHeader('Content-Disposition', 'attachment');
    }
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

// ---------- Assets PUBLICS (logo tenant) ----------
// Ecrits sous le prefixe public/ (lecture anonyme via policy bucket) -> servis
// en direct, sans token ni proxy. Utilises par la page Personnalisation (staff)
// et par l'ops-admin (via l'orchestrator, service-token). Les deux ecrivent le
// MEME asset au MEME endroit -> logo unifie entre les deux interfaces.

// STAFF : upload du logo depuis la page Personnalisation du dashboard tenant.
router.post('/public-image', authenticate, uploadImageMiddleware, async (req, res, next) => {
  try {
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    const orgId = req.user?.organizationId ?? 'org';
    const storage = container.resolve(StorageService);
    const ext = extFromMime(file.mimetype);
    const key = `${StorageService.PUBLIC_PREFIX}logos/${orgId}-${Date.now()}.${ext}`;
    await storage.uploadBuffer(key, file.buffer, file.mimetype);
    const url = publicAssetUrl(req, storage, key);
    res.json({ success: true, data: { url, key, contentType: file.mimetype, size: file.size } });
  } catch (err) {
    next(err);
  }
});

// OPS : upload du logo relaye par l'orchestrator (multipart `image` + service-token,
// orgId en query). L'orchestrator relaie le fichier BINAIRE choisi dans l'ops-admin
// Studio jusqu'ici (pas de base64), car l'orchestrator n'a pas d'object storage.
router.post('/public-image/from-file', uploadImageMiddleware, async (req, res, next) => {
  try {
    if (!hasServiceToken(req)) {
      return res.status(401).json({ success: false, message: 'Service token invalide' });
    }
    const file = (req as any).file as Express.Multer.File | undefined;
    const orgId = (req.query.orgId as string | undefined) ?? (req.body?.orgId as string | undefined);
    if (!orgId) return res.status(400).json({ success: false, message: 'orgId requis' });
    if (!file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
    const storage = container.resolve(StorageService);
    const ext = extFromMime(file.mimetype);
    const key = `${StorageService.PUBLIC_PREFIX}logos/${orgId}-${Date.now()}.${ext}`;
    await storage.uploadBuffer(key, file.buffer, file.mimetype);
    const url = publicAssetUrl(req, storage, key);
    res.json({ success: true, data: { url, key, contentType: file.mimetype, size: file.size } });
  } catch (err) {
    next(err);
  }
});

export default router;
