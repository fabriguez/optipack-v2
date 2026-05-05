import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { container } from '../../container';
import { prisma } from '../../config/database';
import { ExcelService } from '../../infrastructure/excel/ExcelService';
import { StorageService } from '../../infrastructure/storage/StorageService';
import { PayrollChargeService } from '../../application/services/PayrollChargeService';
import { NotFoundError, BusinessError } from '../../domain/errors/BusinessError';
import { logger } from '../../config/logger';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

export const xlsxImportMiddleware = upload.single('file');

interface ImportSummary {
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

/**
 * Imports XLSX avec images embarquees.
 *
 * Format attendu :
 *  - Premiere ligne : entetes (les noms doivent matcher ceux de l'export)
 *  - Lignes suivantes : donnees + images embarquees dans les cellules image
 *
 * Pour chaque image trouvee, on l'uploade sur MinIO via StorageService et on
 * stocke l'URL relative `/api/v1/uploads/object/<key>` dans le champ correspondant.
 */
export class ImportController {
  static async employees(req: Request, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file as Express.Multer.File | undefined;
      if (!file) return res.status(400).json({ success: false, message: 'Aucun fichier fourni' });

      // agencyId optionnel : si fourni, force toutes les lignes sur cette agence.
      const forceAgencyId = req.params.agencyId || (req.body?.agencyId as string | undefined) || (req.query.agencyId as string | undefined);

      const excel = container.resolve(ExcelService);
      const storage = container.resolve(StorageService);
      const payroll = container.resolve(PayrollChargeService);

      const parsed = await excel.parse(file.buffer);
      const summary: ImportSummary = { imported: 0, skipped: 0, errors: [] };
      const touchedAgencies = new Set<string>();

      for (let i = 0; i < parsed.rows.length; i++) {
        const row = parsed.rows[i];
        const rowNum = i + 2; // +1 header, +1 1-based
        try {
          const fullName = (row.values['Nom complet'] || row.values['fullName'] || '').trim();
          if (!fullName) {
            summary.skipped += 1;
            continue;
          }
          const position = row.values['Poste'] || row.values['position'] || '';
          const phone = row.values['Telephone'] || row.values['phone'] || null;
          const idNumber = row.values["N. identite"] || row.values['idNumber'] || null;
          const level = row.values['Niveau'] || row.values['level'] || null;
          const baseSalary = Number(row.values['Salaire de base'] || row.values['baseSalary'] || 0) || 0;
          const agencyName = row.values['Agence'] || '';

          let agencyId = forceAgencyId;
          if (!agencyId) {
            // Recherche par nom (best-effort)
            if (!agencyName) throw new BusinessError(`Ligne ${rowNum} : agence manquante`);
            const agency = await prisma.agency.findFirst({ where: { name: agencyName } });
            if (!agency) throw new NotFoundError('Agence', agencyName);
            agencyId = agency.id;
          }

          // Upload images si presentes
          const uploads: Record<string, string> = {};
          for (const slotHeader of ['Selfie', 'Plan localisation', 'Document identite'] as const) {
            const img = row.images[slotHeader];
            if (!img) continue;
            const slot = slotHeader === 'Selfie' ? 'selfie' : slotHeader === 'Plan localisation' ? 'locationPlan' : 'idDocument';
            const key = storage.buildKey(`employees/import/${agencyId}`, img.extension);
            const contentType = img.extension === 'png' ? 'image/png' : img.extension === 'gif' ? 'image/gif' : 'image/jpeg';
            await storage.uploadBuffer(key, img.buffer, contentType);
            uploads[`${slot}Url`] = `/api/v1/uploads/object/${encodeURIComponent(key)}`;
            uploads[`${slot}Key`] = key;
          }

          await prisma.employee.create({
            data: {
              fullName,
              position,
              phone,
              idNumber,
              level,
              baseSalary,
              agencyId: agencyId!,
              ...(uploads.selfieUrl && { selfieUrl: uploads.selfieUrl, selfieKey: uploads.selfieKey } as any),
              ...(uploads.locationPlanUrl && { locationPlanUrl: uploads.locationPlanUrl, locationPlanKey: uploads.locationPlanKey } as any),
              ...(uploads.idDocumentUrl && { idDocumentUrl: uploads.idDocumentUrl, idDocumentKey: uploads.idDocumentKey } as any),
            } as any,
          });
          touchedAgencies.add(agencyId!);
          summary.imported += 1;
        } catch (err: any) {
          summary.errors.push({ row: rowNum, message: err?.message || 'Erreur inconnue' });
          logger.warn({ err, row: rowNum }, 'Import employees: row failed');
        }
      }

      // Re-sync masse salariale pour chaque agence touchee
      for (const agencyId of touchedAgencies) {
        await payroll.syncForAgency(agencyId).catch(() => {});
      }

      res.status(201).json({ success: true, data: summary });
    } catch (err) {
      next(err);
    }
  }
}
