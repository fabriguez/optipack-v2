import { injectable } from 'tsyringe';
import ExcelJS from 'exceljs';
import { prisma } from '../../../config/database';
import { createChildLogger } from '../../../config/logger';
import { BusinessError } from '../../../domain/errors/BusinessError';

const logger = createChildLogger('ClientXlsx');

/**
 * Schema XLSX clients : 1 ligne par client. Colonnes alignees sur le schema
 * de creation (CreateClientInput) avec les champs additionnels exportables.
 *
 * Import : skipping si fullName + phone non remplis. Validation par ligne,
 * on collecte les erreurs sans stopper le batch.
 */
const COLUMNS = [
  { key: 'fullName', header: 'Nom complet *', width: 28 },
  { key: 'phone', header: 'Telephone *', width: 18 },
  { key: 'email', header: 'Email', width: 26 },
  { key: 'address', header: 'Adresse', width: 32 },
  { key: 'agencyId', header: 'Agence (id)', width: 36 },
  { key: 'agencyName', header: 'Agence (nom)', width: 22 }, // info read-only
  { key: 'clientType', header: 'Type (INDIVIDUAL/COMPANY/PARTNER)', width: 22 },
  { key: 'loyaltyTier', header: 'Niveau (STANDARD/SILVER/GOLD/PLATINUM)', width: 22 },
  { key: 'idNumber', header: 'CNI numero', width: 18 },
  { key: 'imageUrl', header: 'URL photo profil', width: 30 },
  { key: 'idDocumentUrl', header: 'URL CNI recto', width: 30 },
  { key: 'idDocumentBackUrl', header: 'URL CNI verso', width: 30 },
];

@injectable()
export class ExportClientsXlsxUseCase {
  async execute(organizationId: string, agencyId?: string): Promise<{ buffer: Buffer; fileName: string }> {
    const clients = await prisma.client.findMany({
      where: {
        organizationId,
        ...(agencyId && { agencyId }),
      },
      include: { agency: { select: { name: true } } },
      orderBy: { fullName: 'asc' },
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TransitSoftServices';
    wb.created = new Date();
    const ws = wb.addWorksheet('Clients', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B5E20' },
    } as ExcelJS.FillPattern;
    header.height = 24;

    for (const c of clients) {
      ws.addRow({
        fullName: c.fullName,
        phone: c.phone,
        email: c.email ?? '',
        address: c.address ?? '',
        agencyId: c.agencyId,
        agencyName: c.agency?.name ?? '',
        clientType: c.clientType,
        loyaltyTier: c.loyaltyTier,
        idNumber: c.idNumber ?? '',
        imageUrl: c.imageUrl ?? '',
        idDocumentUrl: c.idDocumentUrl ?? '',
        idDocumentBackUrl: c.idDocumentBackUrl ?? '',
      });
    }

    const buffer = Buffer.from(await wb.xlsx.writeBuffer());
    const fileName = `clients-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return { buffer, fileName };
  }
}

interface ImportResult {
  totalRows: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
}

@injectable()
export class ImportClientsXlsxUseCase {
  async execute(
    organizationId: string,
    buffer: Buffer,
    options: { defaultAgencyId?: string; dryRun?: boolean } = {},
  ): Promise<ImportResult> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new BusinessError('Fichier XLSX vide.');

    // Map headers -> column index, en se basant sur la 1ere ligne (insensible casse).
    const headerRow = ws.getRow(1);
    const colIndex = new Map<string, number>();
    headerRow.eachCell((cell, idx) => {
      const raw = String(cell.value ?? '').trim().toLowerCase();
      const match = COLUMNS.find((c) => c.header.toLowerCase().startsWith(raw.split(' ')[0] ?? ''));
      if (match) colIndex.set(match.key, idx);
    });

    if (!colIndex.has('fullName') || !colIndex.has('phone')) {
      throw new BusinessError(
        'Colonnes obligatoires manquantes : "Nom complet" et "Telephone". Reutilisez le template export.',
      );
    }

    const result: ImportResult = { totalRows: 0, created: 0, skipped: 0, errors: [] };
    const get = (row: ExcelJS.Row, key: string): string => {
      const idx = colIndex.get(key);
      if (!idx) return '';
      const v = row.getCell(idx).value;
      if (v == null) return '';
      if (typeof v === 'object' && 'text' in v) return String((v as { text: string }).text ?? '');
      return String(v).trim();
    };

    const seenPhones = new Set<string>();
    const rowsToCreate: Array<Record<string, unknown>> = [];

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      if (row.cellCount === 0) continue;
      result.totalRows++;

      const fullName = get(row, 'fullName');
      const phone = get(row, 'phone');
      if (!fullName || !phone) {
        result.skipped++;
        result.errors.push({ row: i, reason: 'fullName ou phone manquant' });
        continue;
      }
      if (seenPhones.has(phone)) {
        result.skipped++;
        result.errors.push({ row: i, reason: `telephone duplique dans le fichier (${phone})` });
        continue;
      }
      seenPhones.add(phone);

      const agencyId = get(row, 'agencyId') || options.defaultAgencyId;
      if (!agencyId) {
        result.skipped++;
        result.errors.push({ row: i, reason: 'agencyId manquant et pas de defaut fourni' });
        continue;
      }

      // Skip si client existe deja (meme phone + meme org)
      const exists = await prisma.client.findFirst({
        where: { organizationId, phone },
        select: { id: true },
      });
      if (exists) {
        result.skipped++;
        result.errors.push({ row: i, reason: `telephone existe deja (${phone})` });
        continue;
      }

      const clientType = (get(row, 'clientType') || 'INDIVIDUAL').toUpperCase();
      const loyaltyTier = (get(row, 'loyaltyTier') || 'STANDARD').toUpperCase();

      rowsToCreate.push({
        organizationId,
        agencyId,
        fullName,
        phone,
        email: get(row, 'email') || null,
        address: get(row, 'address') || null,
        clientType: ['INDIVIDUAL', 'COMPANY', 'PARTNER'].includes(clientType)
          ? clientType
          : 'INDIVIDUAL',
        loyaltyTier: ['STANDARD', 'SILVER', 'GOLD', 'PLATINUM'].includes(loyaltyTier)
          ? loyaltyTier
          : 'STANDARD',
        idNumber: get(row, 'idNumber') || null,
        imageUrl: get(row, 'imageUrl') || null,
        idDocumentUrl: get(row, 'idDocumentUrl') || null,
        idDocumentBackUrl: get(row, 'idDocumentBackUrl') || null,
      });
    }

    if (options.dryRun) {
      logger.info({ totalRows: result.totalRows, wouldCreate: rowsToCreate.length }, 'dry-run');
      return result;
    }

    if (rowsToCreate.length > 0) {
      // createMany manque le RETURNING pour count exact, on iter pour pouvoir
      // catcher des erreurs FK individuelles (agencyId invalide par ex).
      for (const data of rowsToCreate) {
        try {
          await prisma.client.create({ data: data as never });
          result.created++;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          result.errors.push({ row: -1, reason: `create ${data.phone} : ${msg.slice(0, 200)}` });
          result.skipped++;
        }
      }
    }

    return result;
  }
}
