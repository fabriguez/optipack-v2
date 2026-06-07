import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { StorageService } from '../../infrastructure/storage/StorageService';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';
import { extFromMime } from '../middleware/upload';
import { config } from '../../config';

type Slot = 'avatar' | 'idDocument' | 'idDocumentBack';

const SLOT_FIELDS: Record<Slot, { urlField: string; keyField: string }> = {
  avatar: { urlField: 'imageUrl', keyField: 'imageKey' },
  idDocument: { urlField: 'idDocumentUrl', keyField: 'idDocumentKey' },
  idDocumentBack: { urlField: 'idDocumentBackUrl', keyField: 'idDocumentBackKey' },
};

function buildAbsoluteUrl(req: Request, key: string): string {
  const safeKey = key.split('/').map(encodeURIComponent).join('/');
  const path = `/api/v1/uploads/object/${safeKey}`;
  const fromEnv = config.apiUrl;
  if (fromEnv && /^https?:\/\//i.test(fromEnv)) {
    return `${fromEnv.replace(/\/$/, '')}${path}`;
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}${path}`;
}

function isLocked(status: string | null | undefined, expiry: Date | null | undefined): boolean {
  if (status !== 'APPROVED') return false;
  if (!expiry) return true;
  return new Date(expiry) > new Date();
}

export class ClientPortalKycController {
  /**
   * PATCH /client-portal/me
   * Met a jour fullName/phone/address/email du client connecte.
   * Verrouille tant que la verification KYC est APPROVED et non perimee.
   */
  static async updateProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const existing = await prisma.client.findUnique({
        where: { id: clientId },
        select: { id: true, idVerificationStatus: true, idExpiryDate: true },
      });
      if (!existing) throw new NotFoundError('Client', clientId);
      if (isLocked(existing.idVerificationStatus, existing.idExpiryDate)) {
        throw new BusinessError(
          'Profil verrouille : documents valides, modification impossible jusqu\'a peremption.',
        );
      }
      const allowed = ['fullName', 'phone', 'email', 'address'] as const;
      const data: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) data[key] = req.body[key];
      }
      const updated = await prisma.client.update({ where: { id: clientId }, data });
      res.json({ success: true, data: updated });
    } catch (err) {
      next(err);
    }
  }

  /**
   * POST /client-portal/me/upload (multipart, field=file, slot=avatar|idDocument|idDocumentBack)
   * Stocke l'objet via StorageService, met a jour le champ URL.
   * Pour les slots ID document : passe automatiquement le statut a PENDING
   * (revalidation requise apres modification).
   */
  static async uploadDocument(req: Request, res: Response, next: NextFunction) {
    try {
      const { clientId } = req.clientPortal!;
      const file = (req as any).file as Express.Multer.File | undefined;
      const slot = (req.body.slot ?? '') as Slot;
      if (!file) throw new BusinessError('Aucun fichier fourni');
      if (!SLOT_FIELDS[slot]) throw new BusinessError('Slot invalide');

      const existing = await prisma.client.findUnique({
        where: { id: clientId },
        select: { idVerificationStatus: true, idExpiryDate: true },
      });
      if (!existing) throw new NotFoundError('Client', clientId);

      const isIdSlot = slot !== 'avatar';
      if (isIdSlot && isLocked(existing.idVerificationStatus, existing.idExpiryDate)) {
        throw new BusinessError(
          'Documents verrouilles : valides et non perimes, attendez la peremption.',
        );
      }

      const storage = container.resolve(StorageService);
      const ext = extFromMime(file.mimetype);
      // Prefixe `uploads/` obligatoire : la route GET /uploads/object/* refuse
      // (404) toute cle hors de ce prefixe. Sans lui, l'avatar et les documents
      // KYC sont stockes mais jamais servis (image vide cote mobile).
      const key = storage.buildKey(`uploads/clients/${clientId}/${slot}`, ext);
      await storage.uploadBuffer(key, file.buffer, file.mimetype);

      const url = buildAbsoluteUrl(req, key);
      const { urlField, keyField } = SLOT_FIELDS[slot];
      const data: Record<string, unknown> = {
        [urlField]: url,
        [keyField]: key,
      };
      if (isIdSlot) {
        // Repasse en attente de validation a chaque upload d'ID.
        data.idVerificationStatus = 'PENDING';
        data.idVerifiedAt = null;
        data.idVerifiedByUserId = null;
        data.idExpiryDate = null;
        data.idRejectionReason = null;
      }
      await prisma.client.update({ where: { id: clientId }, data });
      res.json({ success: true, data: { url, key, slot } });
    } catch (err) {
      next(err);
    }
  }
}
