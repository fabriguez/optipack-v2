import type { Request, Response, NextFunction } from 'express';
import { container } from '../../container';
import { CreateClientUseCase } from '../../application/use-cases/client/CreateClientUseCase';
import { ListClientsUseCase } from '../../application/use-cases/client/ListClientsUseCase';
import { GetClientUseCase } from '../../application/use-cases/client/GetClientUseCase';
import { UpdateClientUseCase } from '../../application/use-cases/client/UpdateClientUseCase';
import { DeleteClientUseCase } from '../../application/use-cases/client/DeleteClientUseCase';
import {
  UploadClientImageUseCase,
  DeleteClientImageUseCase,
  GetClientImageUseCase,
} from '../../application/use-cases/client/ClientImageUseCases';
import {
  ExportClientsXlsxUseCase,
  ImportClientsXlsxUseCase,
} from '../../application/use-cases/client/ClientXlsxUseCases';
import { BusinessError, NotFoundError } from '../../domain/errors/BusinessError';
import { getOrgId } from '../middleware/tenantGuard';

export class ClientController {
  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(CreateClientUseCase);
      const client = await useCase.execute(req.body, getOrgId(req));
      res.status(201).json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ListClientsUseCase);
      const agencyId = req.query.agencyId as string | undefined;
      const result = await useCase.execute(
        { organizationId: getOrgId(req), agencyId },
        req.query as never,
      );
      res.json({ success: true, ...result });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(GetClientUseCase);
      const client = await useCase.execute(req.params.id);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(UpdateClientUseCase);
      const client = await useCase.execute(req.params.id, req.body);
      res.json({ success: true, data: client });
    } catch (err) {
      next(err);
    }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(DeleteClientUseCase);
      await useCase.execute(req.params.id);
      res.json({ success: true, message: 'Client desactive' });
    } catch (err) {
      next(err);
    }
  }

  // ----- Photos client (profile / idDocument / idDocumentBack) -----

  static async uploadImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'profile' | 'idDocument' | 'idDocumentBack';
      if (!['profile', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo client', slot);
      }
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });
      const useCase = container.resolve(UploadClientImageUseCase);
      const result = await useCase.execute(req.params.id, slot, file);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async deleteImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'profile' | 'idDocument' | 'idDocumentBack';
      if (!['profile', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo client', slot);
      }
      const useCase = container.resolve(DeleteClientImageUseCase);
      const result = await useCase.execute(req.params.id, slot);
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getImage(req: Request, res: Response, next: NextFunction) {
    try {
      const slot = req.params.slot as 'profile' | 'idDocument' | 'idDocumentBack';
      if (!['profile', 'idDocument', 'idDocumentBack'].includes(slot)) {
        throw new NotFoundError('Slot photo client', slot);
      }
      const useCase = container.resolve(GetClientImageUseCase);
      const obj = await useCase.execute(req.params.id, slot);
      if (!obj) return res.status(404).end();
      res.setHeader('Content-Type', obj.contentType);
      res.setHeader('Content-Length', String(obj.size));
      res.setHeader('Cache-Control', 'private, max-age=86400');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      obj.stream.pipe(res);
    } catch (err) {
      next(err);
    }
  }

  /** GET /clients/export.xlsx?agencyId=... */
  static async exportXlsx(req: Request, res: Response, next: NextFunction) {
    try {
      const useCase = container.resolve(ExportClientsXlsxUseCase);
      const agencyId = (req.query.agencyId as string | undefined) || undefined;
      const { buffer, fileName } = await useCase.execute(getOrgId(req), agencyId);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (err) {
      next(err);
    }
  }

  /** POST /clients/import (multipart, "file") -> rapport {created, skipped, errors[]} */
  static async importXlsx(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as Request & { file?: { buffer: Buffer; mimetype: string } }).file;
      if (!file?.buffer) {
        throw new BusinessError('Fichier XLSX manquant (champ "file")');
      }
      const useCase = container.resolve(ImportClientsXlsxUseCase);
      const result = await useCase.execute(getOrgId(req), file.buffer, {
        defaultAgencyId: (req.body?.defaultAgencyId as string | undefined) || undefined,
        dryRun: req.body?.dryRun === 'true' || req.body?.dryRun === true,
      });
      res.json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }
}
