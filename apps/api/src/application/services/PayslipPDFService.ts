import PDFDocument from 'pdfkit';
import { injectable } from 'tsyringe';

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function fmtMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v).replace(/[  ]/g, ' ')} FCFA`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const CONTRACT_LABELS: Record<string, string> = {
  STAGIAIRE: 'Stagiaire',
  CDD: 'CDD',
  CDI: 'CDI',
  PRESTATAIRE: 'Prestataire',
};

export interface PayslipPDFInput {
  period: string;
  generatedAt: Date | string;
  paidAt?: Date | string | null;
  organization?: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxNumber?: string | null;
    primaryColor?: string | null;
    secondaryColor?: string | null;
    accentColor?: string | null;
  } | null;
  agency?: { name: string; address?: string | null; phone?: string | null } | null;
  employee: {
    fullName: string;
    matricule?: string | null;
    position?: string | null;
    service?: string | null;
    contractType?: string | null;
  };
  baseSalary: number;
  bonuses?: number;
  benefitsInKind?: number;
  socialContributions?: number;
  grossSalary: number;
  netSalary: number;
  deductionsTotal?: number;
  /** Lignes de retenue detaillees (CNPS, IRPP, avances, ...). */
  deductionLines?: Array<{ label: string; amount: number }>;
  /** Lignes de remuneration detaillees (primes). */
  earningLines?: Array<{ label: string; quantity?: string; rate?: string; amount: number }>;
  paymentMethod?: 'CASH' | 'BANK_TRANSFER' | 'MOBILE_MONEY' | string | null;
  bankInfo?: string | null;
  logoBuffer?: Buffer | null;
}

/**
 * Bulletin de paie PDF aux couleurs du tenant. Structure :
 *  - Entete entreprise (logo + nom + agence + adresse + tel + N contribuable)
 *  - Bandeau "BULLETIN DE PAIE"
 *  - Bloc infos employe
 *  - Tableau detail des remunerations
 *  - Tableau retenues
 *  - Recapitulatif (brut / retenues / net a payer)
 *  - Mode de paiement (cases a cocher)
 *  - Zone signatures
 */
@injectable()
export class PayslipPDFService {
  async generate(input: PayslipPDFInput): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

    const org = input.organization ?? {} as any;
    const primary = (org.primaryColor as string) || '#1B5E20';
    const secondary = (org.secondaryColor as string) || '#4CAF50';
    const accent = (org.accentColor as string) || '#E8F5E9';
    const dark = '#1F2937';
    const gray = '#6B7280';
    const lightGray = '#F3F4F6';
    const white = '#FFFFFF';

    const leftX = 40;
    const pageWidth = doc.page.width - 80;
    let y = 0;

    // ---------- Entete entreprise ----------
    doc.rect(0, 0, doc.page.width, 96).fill(primary);
    if (input.logoBuffer) {
      try {
        doc.roundedRect(leftX, 20, 56, 56, 6).fill(white);
        doc.image(input.logoBuffer, leftX + 4, 24, { fit: [48, 48] });
      } catch { /* logo optionnel */ }
    }
    const headTextX = input.logoBuffer ? leftX + 68 : leftX;
    doc.fillColor(white).font('Helvetica-Bold').fontSize(15)
      .text((org.name || 'ENTREPRISE').toUpperCase(), headTextX, 22, { width: pageWidth - 68 });
    doc.font('Helvetica').fontSize(8.5).fillColor(white);
    let hy = 42;
    if (input.agency?.name) { doc.text(`Agence d'attache : ${input.agency.name}`, headTextX, hy, { width: pageWidth - 68 }); hy += 12; }
    const addr = org.address || input.agency?.address;
    if (addr) { doc.text(`Adresse : ${addr}`, headTextX, hy, { width: pageWidth - 68 }); hy += 12; }
    const phone = org.phone || input.agency?.phone;
    if (phone) { doc.text(`Telephone : ${phone}`, headTextX, hy, { width: pageWidth - 68 }); hy += 12; }
    if (org.taxNumber) { doc.text(`N Contribuable : ${org.taxNumber}`, headTextX, hy, { width: pageWidth - 68 }); }

    // ---------- Bandeau titre ----------
    y = 110;
    doc.rect(leftX, y, pageWidth, 30).fill(secondary);
    doc.fillColor(white).font('Helvetica-Bold').fontSize(15)
      .text('BULLETIN DE PAIE', leftX, y + 8, { width: pageWidth, align: 'center' });
    y += 42;

    // ---------- Infos employe ----------
    doc.rect(leftX, y, pageWidth, 76).fill(accent).strokeColor(secondary).lineWidth(0.5).stroke();
    const colW = pageWidth / 2;
    const infoRow = (label: string, value: string, col: 0 | 1, row: number) => {
      const x = leftX + 10 + col * colW;
      const ry = y + 8 + row * 16;
      doc.font('Helvetica').fontSize(8.5).fillColor(gray).text(label, x, ry, { width: colW - 20, continued: true });
      doc.font('Helvetica-Bold').fillColor(dark).text(` ${value || '-'}`);
    };
    infoRow('Nom et prenom :', input.employee.fullName, 0, 0);
    infoRow('Matricule :', input.employee.matricule || '-', 1, 0);
    infoRow('Poste / Fonction :', input.employee.position || '-', 0, 1);
    infoRow('Service :', input.employee.service || (input.employee.contractType ? CONTRACT_LABELS[input.employee.contractType] ?? input.employee.contractType : '-'), 1, 1);
    infoRow('Periode de paie :', input.period, 0, 2);
    infoRow('Date de paiement :', fmtDate(input.paidAt ?? input.generatedAt), 1, 2);
    y += 88;

    // ---------- Helper tableau ----------
    const drawTableHeader = (cols: { label: string; width: number; align?: 'left' | 'right' }[]) => {
      doc.rect(leftX, y, pageWidth, 20).fill(primary);
      doc.fillColor(white).font('Helvetica-Bold').fontSize(8.5);
      let x = leftX + 6;
      for (const c of cols) {
        doc.text(c.label, x, y + 6, { width: c.width - 8, align: c.align ?? 'left' });
        x += c.width;
      }
      y += 20;
    };
    const drawRow = (cells: string[], cols: { width: number; align?: 'left' | 'right' }[], opts: { bold?: boolean; bg?: string } = {}) => {
      doc.rect(leftX, y, pageWidth, 18).fill(opts.bg ?? white);
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(dark);
      let x = leftX + 6;
      for (let i = 0; i < cols.length; i++) {
        doc.text(cells[i] ?? '', x, y + 5, { width: cols[i].width - 8, align: cols[i].align ?? 'left', lineBreak: false, ellipsis: true });
        x += cols[i].width;
      }
      y += 18;
    };
    const sectionLabel = (label: string) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(primary).text(label, leftX, y);
      y += 16;
    };

    // ---------- Detail des remunerations ----------
    sectionLabel('DETAIL DES REMUNERATIONS');
    const earnCols = [
      { width: pageWidth - 240, align: 'left' as const },
      { width: 70, align: 'right' as const },
      { width: 70, align: 'right' as const },
      { width: 100, align: 'right' as const },
    ];
    drawTableHeader([
      { label: 'Designation', width: earnCols[0].width },
      { label: 'Quantite', width: earnCols[1].width, align: 'right' },
      { label: 'Taux', width: earnCols[2].width, align: 'right' },
      { label: 'Montant', width: earnCols[3].width, align: 'right' },
    ]);
    const earnings: Array<{ label: string; quantity?: string; rate?: string; amount: number }> =
      input.earningLines && input.earningLines.length > 0
        ? input.earningLines
        : [
            { label: 'Salaire de base', amount: input.baseSalary },
            ...((input.bonuses ?? 0) > 0 ? [{ label: 'Primes', amount: input.bonuses ?? 0 }] : []),
            ...((input.benefitsInKind ?? 0) > 0 ? [{ label: 'Indemnites / avantages', amount: input.benefitsInKind ?? 0 }] : []),
          ];
    earnings.forEach((e, i) => {
      drawRow(
        [e.label, e.quantity ?? '', e.rate ?? '', fmtMoney(e.amount)],
        earnCols,
        { bg: i % 2 === 0 ? white : lightGray },
      );
    });
    drawRow(['Salaire Brut', '', '', fmtMoney(input.grossSalary)], earnCols, { bold: true, bg: accent });
    y += 14;

    // ---------- Retenues ----------
    sectionLabel('RETENUES');
    const dedCols = [
      { width: pageWidth - 160, align: 'left' as const },
      { width: 160, align: 'right' as const },
    ];
    drawTableHeader([
      { label: 'Designation', width: dedCols[0].width },
      { label: 'Montant', width: dedCols[1].width, align: 'right' },
    ]);
    const deductions: Array<{ label: string; amount: number }> =
      input.deductionLines && input.deductionLines.length > 0
        ? input.deductionLines
        : [
            ...((input.socialContributions ?? 0) > 0 ? [{ label: 'CNPS / cotisations sociales', amount: input.socialContributions ?? 0 }] : []),
            ...((input.deductionsTotal ?? 0) > 0 ? [{ label: 'Autres retenues', amount: input.deductionsTotal ?? 0 }] : []),
          ];
    if (deductions.length === 0) {
      drawRow(['Aucune retenue', '-'], dedCols);
    } else {
      deductions.forEach((d, i) => {
        drawRow([d.label, fmtMoney(d.amount)], dedCols, { bg: i % 2 === 0 ? white : lightGray });
      });
    }
    const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
    drawRow(['Total Retenues', fmtMoney(totalDeductions)], dedCols, { bold: true, bg: accent });
    y += 14;

    // ---------- Recapitulatif ----------
    sectionLabel('RECAPITULATIF');
    const recapCols = [
      { width: pageWidth - 160, align: 'left' as const },
      { width: 160, align: 'right' as const },
    ];
    drawRow(['Salaire Brut', fmtMoney(input.grossSalary)], recapCols, { bg: lightGray });
    drawRow(['Total Retenues', fmtMoney(totalDeductions)], recapCols, { bg: white });
    // Net a payer = bandeau colore en evidence
    doc.rect(leftX, y, pageWidth, 24).fill(primary);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(white)
      .text('SALAIRE NET A PAYER', leftX + 6, y + 7, { width: recapCols[0].width - 8 });
    doc.fontSize(12)
      .text(fmtMoney(input.netSalary), leftX + recapCols[0].width, y + 6, { width: recapCols[1].width - 8, align: 'right' });
    y += 36;

    // ---------- Mode de paiement ----------
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(primary).text('Mode de paiement', leftX, y);
    y += 16;
    const method = (input.paymentMethod ?? '').toUpperCase();
    const checkbox = (label: string, checked: boolean, x: number) => {
      doc.rect(x, y, 11, 11).strokeColor(gray).lineWidth(1).stroke();
      if (checked) {
        doc.font('Helvetica-Bold').fontSize(10).fillColor(primary).text('X', x + 2, y + 0.5);
      }
      doc.font('Helvetica').fontSize(9).fillColor(dark).text(label, x + 16, y + 1);
    };
    checkbox('Especes', method === 'CASH', leftX);
    checkbox('Virement bancaire', method === 'BANK_TRANSFER', leftX + 120);
    checkbox('Mobile Money', method === 'MOBILE_MONEY', leftX + 280);
    y += 22;
    doc.font('Helvetica').fontSize(8.5).fillColor(gray)
      .text(`Banque / Numero : ${input.bankInfo || '____________________________'}`, leftX, y);
    y += 30;

    // ---------- Signatures ----------
    const sigW = (pageWidth - 20) / 2;
    const sigY = Math.max(y, doc.page.height - 130);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(dark);
    doc.text('Employeur', leftX, sigY, { width: sigW, align: 'center' });
    doc.text('Employe', leftX + sigW + 20, sigY, { width: sigW, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(gray);
    doc.text('Signature & Cachet', leftX, sigY + 14, { width: sigW, align: 'center' });
    doc.text('Signature', leftX + sigW + 20, sigY + 14, { width: sigW, align: 'center' });
    doc.moveTo(leftX + 20, sigY + 60).lineTo(leftX + sigW - 20, sigY + 60).strokeColor(gray).lineWidth(0.5).stroke();
    doc.moveTo(leftX + sigW + 40, sigY + 60).lineTo(leftX + 2 * sigW, sigY + 60).stroke();

    // ---------- Footer ----------
    const footerY = doc.page.height - 46;
    doc.moveTo(leftX, footerY).lineTo(leftX + pageWidth, footerY).strokeColor(primary).lineWidth(0.8).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(gray)
      .text(
        `${org.name ?? ''}${org.email ? ' - ' + org.email : ''} - Bulletin genere le ${fmtDate(input.generatedAt)}`,
        leftX, footerY + 6, { width: pageWidth, align: 'center' },
      );

    return collectBuffer(doc);
  }
}

export const PAYSLIP_PDF_SERVICE = Symbol.for('PayslipPDFService');
