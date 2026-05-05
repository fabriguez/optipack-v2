import { injectable } from 'tsyringe';
import ExcelJS from 'exceljs';
import { Readable } from 'stream';
import { minioClient } from '../../config/minio';
import { config } from '../../config';
import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('ExcelService');
const BUCKET = config.minio.bucket;

export interface ExcelColumnDef<T = any> {
  /** Cle dans l'objet de donnee */
  key: string;
  header: string;
  width?: number;
  /** Si true, la cellule contient une URL d'image qui sera embarquee */
  isImage?: boolean;
  /** Transformation custom (object -> string a afficher) */
  format?: (value: any, row: T) => string;
}

export interface ExcelImportRow {
  values: Record<string, string>;
  /** Images embarquees dans la ligne (par colonne) */
  images: Record<string, { buffer: Buffer; extension: string }>;
}

@injectable()
export class ExcelService {
  /**
   * Genere un classeur XLSX avec les images embarquees pour les colonnes
   * marquees `isImage: true`. Les URL pointent vers MinIO via /api/v1/.../image
   * ou /api/v1/uploads/object/<key> -- on extrait la cle et on lit le buffer.
   */
  async generate<T extends Record<string, any>>(
    sheetName: string,
    columns: ExcelColumnDef<T>[],
    rows: T[],
  ): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'TransitSoftServices';
    wb.created = new Date();

    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    ws.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? 18,
    }));

    // Style header
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1B5E20' },
    } as ExcelJS.FillPattern;
    headerRow.alignment = { vertical: 'middle' };
    headerRow.height = 22;

    // Insertion lignes -- on pose les valeurs textuelles, on incrustera les
    // images dans une seconde passe (necessaire car addImage + cell range).
    for (const row of rows) {
      const data: Record<string, any> = {};
      for (const col of columns) {
        if (col.isImage) {
          // On laisse vide : l'image sera incrustee.
          data[col.key] = '';
        } else {
          const raw = row[col.key];
          data[col.key] = col.format ? col.format(raw, row) : this.flatten(raw);
        }
      }
      ws.addRow(data);
    }

    // Images : on lit les buffers et on incruste
    for (let i = 0; i < rows.length; i++) {
      const excelRow = i + 2; // +1 header, +1 1-based
      ws.getRow(excelRow).height = 60;
      for (let cIdx = 0; cIdx < columns.length; cIdx++) {
        const col = columns[cIdx];
        if (!col.isImage) continue;
        const url = rows[i][col.key];
        if (!url || typeof url !== 'string') continue;

        const objectKey = this.urlToStorageKey(url);
        if (!objectKey) continue;

        try {
          const stat = await minioClient.statObject(BUCKET, objectKey);
          const stream = (await minioClient.getObject(BUCKET, objectKey)) as unknown as Readable;
          const buf = await this.streamToBuffer(stream);
          const contentType = (stat.metaData?.['content-type'] as string) || 'image/jpeg';
          const extension = this.extFromContentType(contentType);
          if (!extension) continue;
          const imageId = wb.addImage({ buffer: buf as any, extension });
          ws.addImage(imageId, {
            tl: { col: cIdx, row: excelRow - 1 } as any,
            ext: { width: 80, height: 60 },
            editAs: 'oneCell',
          });
        } catch (err) {
          logger.warn({ err, url }, 'ExcelService: failed to embed image, skipping');
        }
      }
    }

    const arrBuf = await wb.xlsx.writeBuffer();
    return Buffer.from(arrBuf as ArrayBuffer);
  }

  /**
   * Parse un classeur XLSX et extrait, pour chaque ligne, les valeurs textuelles
   * + les images embarquees (par colonne d'origine).
   * Important : ExcelJS lit toutes les images du worksheet via `getImages()`,
   * et on les associe a leur cellule via la propriete `range.tl` (top-left).
   */
  async parse(buffer: Buffer, sheetIndex = 0): Promise<{ headers: string[]; rows: ExcelImportRow[] }> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[sheetIndex];
    if (!ws) return { headers: [], rows: [] };

    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell, col) => {
      headers[col - 1] = String(cell.value ?? '').trim();
    });

    // Index images par cellule (rowIndex, colIndex) : on cree une map
    const wsImages = ws.getImages?.() ?? [];
    type ImagePayload = { buffer: Buffer; extension: string };
    const cellImages: Map<string, ImagePayload> = new Map();
    for (const img of wsImages) {
      try {
        const tl = (img.range as any).tl;
        const rowIdx = Math.floor(tl.nativeRow ?? tl.row ?? 0);
        const colIdx = Math.floor(tl.nativeCol ?? tl.col ?? 0);
        const imageDef = (wb as any).getImage?.(img.imageId) ?? (wb.model as any).media?.find?.((m: any) => m.index === img.imageId);
        if (!imageDef?.buffer) continue;
        cellImages.set(`${rowIdx + 1}:${colIdx}`, {
          buffer: imageDef.buffer as Buffer,
          extension: imageDef.extension || 'png',
        });
      } catch (err) {
        logger.warn({ err }, 'ExcelService.parse: failed to read embedded image');
      }
    }

    const rows: ExcelImportRow[] = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      if (!row || row.actualCellCount === 0) continue;
      const values: Record<string, string> = {};
      const images: Record<string, ImagePayload> = {};
      for (let c = 0; c < headers.length; c++) {
        const header = headers[c];
        if (!header) continue;
        const cell = row.getCell(c + 1);
        const v = cell.value;
        let text = '';
        if (v == null) text = '';
        else if (typeof v === 'object') {
          // formula / hyperlink / richtext / date
          if ((v as any).text) text = String((v as any).text);
          else if ((v as any).result !== undefined) text = String((v as any).result);
          else if (v instanceof Date) text = v.toISOString();
          else text = String(v);
        } else {
          text = String(v);
        }
        values[header] = text.trim();

        const imgKey = `${r}:${c}`;
        const img = cellImages.get(imgKey);
        if (img) images[header] = img;
      }
      rows.push({ values, images });
    }

    return { headers, rows };
  }

  /** Convertit Stream -> Buffer. */
  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  /**
   * Mappe une URL d'image servie par l'API vers la cle MinIO sous-jacente.
   * Gere les patrons connus :
   *  - /api/v1/uploads/object/<encoded-key>
   *  - /api/v1/agencies/:id/image  (cle stockee dans agency.imageKey, mais on l'a pas ici)
   *  - /api/v1/employees/:id/image/:slot (idem)
   * On ne gere ici que /uploads/object/<key> car c'est le format generique.
   */
  private urlToStorageKey(url: string): string | null {
    const match = url.match(/\/uploads\/object\/([^?#]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return match[1];
      }
    }
    return null;
  }

  private extFromContentType(ct: string): 'jpeg' | 'png' | 'gif' | null {
    if (ct.includes('jpeg') || ct.includes('jpg')) return 'jpeg';
    if (ct.includes('png')) return 'png';
    if (ct.includes('gif')) return 'gif';
    return null;
  }

  private flatten(value: any): string {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      const candidate = value.fullName ?? value.name ?? value.label ?? value.reference ?? value.designation ?? null;
      if (candidate) return String(candidate);
      try {
        return JSON.stringify(value);
      } catch {
        return '';
      }
    }
    return String(value);
  }
}

export const EXCEL_SERVICE = Symbol.for('ExcelService');
