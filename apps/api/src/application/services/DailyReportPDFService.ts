import PDFDocument from 'pdfkit';
import { injectable } from 'tsyringe';

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** Groupement millier manuel (espace ASCII) -- evite le glyphe parasite
 *  U+202F de Intl/locale-fr non rendu par la police pdfkit Helvetica. */
function groupThousands(n: number, decimals = 0): string {
  const fixed = (Number.isFinite(n) ? n : 0).toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const digits = sign ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped}${decPart ? ',' + decPart : ''}`;
}

function formatCurrency(n: number): string {
  return `${groupThousands(Math.round(Number.isFinite(n) ? n : 0))} FCFA`;
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtWeight(n: number): string {
  return `${groupThousands(n || 0, 2)} kg`;
}

function fmtVolume(n: number): string {
  return `${groupThousands(n || 0, 3)} m3`;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: 'Especes',
  MOBILE_MONEY: 'Mobile Money',
  BANK_TRANSFER: 'Virement',
  CARD: 'Carte',
  CHECK: 'Cheque',
};

const TRANSIT_LABELS: Record<string, string> = {
  AIR: 'Aerien',
  SEA: 'Maritime',
  LAND: 'Terrestre',
  OTHER: 'Autre',
};

interface DailyReportPDFInput {
  reportDate: Date | string;
  status: string;
  observation: string | null;
  closedByName?: string | null;
  closedAt?: Date | string | null;
  payload: any;
  attachments?: Array<{ id: string; fileName: string | null; caption: string | null; contentType: string | null; createdAt: string }>;
  /** Logo en bytes (recupere depuis MinIO par le controller). */
  logoBuffer?: Buffer | null;
}

@injectable()
export class DailyReportPDFService {
  async generate(input: DailyReportPDFInput): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

    const org = input.payload?.organization ?? {};
    const agency = input.payload?.agency ?? {};
    const primary = (org.primaryColor as string) || '#1B5E20';
    const secondary = (org.secondaryColor as string) || '#4CAF50';
    const accent = (org.accentColor as string) || '#E8F5E9';
    const dark = '#1F2937';
    const gray = '#6B7280';
    const lightGray = '#F3F4F6';
    const white = '#FFFFFF';

    const pageWidth = doc.page.width - 80;
    const leftX = 40;

    // ---------- Header ----------
    const drawHeader = () => {
      doc.rect(0, 0, doc.page.width, 90).fill(primary);
      if (input.logoBuffer) {
        try {
          doc.image(input.logoBuffer, leftX, 18, { fit: [54, 54] });
        } catch { /* skip */ }
      }
      doc.fillColor(white).font('Helvetica-Bold').fontSize(16)
        .text((org.name || '').toUpperCase(), leftX + 64, 22, { width: pageWidth - 64 });
      doc.font('Helvetica').fontSize(9).fillColor(white)
        .text(`Agence : ${agency.name ?? '-'} (${agency.code ?? '-'})`, leftX + 64, 44, { width: pageWidth - 64 });
      doc.text(`${agency.address ?? ''} ${agency.city ? '- ' + agency.city : ''}`.trim(), leftX + 64, 58, { width: pageWidth - 64 });
      if (agency.phone) doc.text(`Tel : ${agency.phone}`, leftX + 64, 72, { width: pageWidth - 64 });

      // Bandeau titre
      const titleY = 100;
      doc.rect(leftX, titleY, pageWidth, 36).fill(accent).strokeColor(primary).lineWidth(1).stroke();
      doc.fillColor(primary).font('Helvetica-Bold').fontSize(14)
        .text('RAPPORT JOURNALIER D\'ACTIVITE', leftX + 10, titleY + 6, { width: pageWidth - 20 });
      doc.font('Helvetica').fontSize(9).fillColor(dark)
        .text(`Date : ${formatDate(input.reportDate)}`, leftX + 10, titleY + 22)
        .text(`Statut : ${input.status}`, leftX + 200, titleY + 22)
        .text(`Genere le ${formatDateTime(input.payload?.generatedAt ?? new Date())}`, leftX + 10, titleY + 22, {
          width: pageWidth - 20,
          align: 'right',
        });
    };

    // ---------- Footer (sur toutes les pages) ----------
    const drawFooter = (pageNum: number, pageCount: number) => {
      const y = doc.page.height - 50;
      doc.moveTo(leftX, y).lineTo(leftX + pageWidth, y).strokeColor(primary).lineWidth(0.8).stroke();
      doc.fillColor(gray).font('Helvetica').fontSize(8)
        .text(
          [org.name, org.email, org.phone].filter(Boolean).join(' - ') || '',
          leftX, y + 6, { width: pageWidth, align: 'center' },
        );
      doc.text(`Page ${pageNum} / ${pageCount}`, leftX, y + 20, { width: pageWidth, align: 'center' });
    };

    drawHeader();
    let y = 150;

    const sectionTitle = (label: string) => {
      ensureSpace(40);
      doc.rect(leftX, y, pageWidth, 22).fill(secondary);
      doc.fillColor(white).font('Helvetica-Bold').fontSize(10)
        .text(label, leftX + 8, y + 6, { width: pageWidth - 16 });
      y += 28;
      doc.fillColor(dark).font('Helvetica').fontSize(9);
    };

    const ensureSpace = (h: number) => {
      if (y + h > doc.page.height - 70) {
        doc.addPage();
        drawHeader();
        y = 150;
      }
    };

    const writeLine = (txt: string, opts: { bold?: boolean; size?: number; color?: string; indent?: number } = {}) => {
      ensureSpace(14);
      doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 9).fillColor(opts.color ?? dark)
        .text(txt, leftX + (opts.indent ?? 0), y, { width: pageWidth - (opts.indent ?? 0) });
      y += (opts.size ?? 9) + 5;
    };

    const writeKV = (label: string, value: string) => {
      ensureSpace(14);
      doc.font('Helvetica').fontSize(9).fillColor(gray).text(label, leftX + 10, y, { width: 220 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(dark).text(value, leftX + 230, y, { width: pageWidth - 240, align: 'right' });
      y += 14;
    };

    const drawTable = (cols: { label: string; width: number; align?: 'left' | 'right' }[], rows: string[][]) => {
      ensureSpace(28 + rows.length * 18);
      doc.rect(leftX, y, pageWidth, 20).fill(primary);
      doc.fillColor(white).font('Helvetica-Bold').fontSize(8);
      let x = leftX + 6;
      for (const c of cols) {
        doc.text(c.label, x, y + 6, { width: c.width - 6, align: c.align ?? 'left' });
        x += c.width;
      }
      y += 20;
      doc.font('Helvetica').fontSize(8);
      rows.forEach((r, idx) => {
        ensureSpace(20);
        const bg = idx % 2 === 0 ? white : lightGray;
        doc.rect(leftX, y, pageWidth, 18).fill(bg);
        doc.fillColor(dark);
        x = leftX + 6;
        for (let c = 0; c < cols.length; c++) {
          doc.text(r[c] ?? '', x, y + 5, { width: cols[c].width - 6, lineBreak: false, ellipsis: true, align: cols[c].align ?? 'left' });
          x += cols[c].width;
        }
        y += 18;
      });
    };

    const p = input.payload ?? {};

    // ------------------------------------------------------------------
    // I. Recettes (paiements sur colis arrives a destination)
    // ------------------------------------------------------------------
    sectionTitle('I. RECETTES (paiements sur colis arrives a destination)');
    const recetteRoutes = Object.values((p.recetteByRouteAndMethod ?? {}) as Record<string, any>);
    if (recetteRoutes.length === 0) writeLine('Aucune recette enregistree sur cette periode.', { color: gray });
    else {
      drawTable(
        [
          { label: 'Route', width: 200 },
          { label: 'Methodes', width: 200 },
          { label: 'Total', width: pageWidth - 400, align: 'right' },
        ],
        recetteRoutes.map((r: any) => [
          `${r.routeName}${r.type ? ' (' + (TRANSIT_LABELS[r.type] ?? r.type) + ')' : ''}`,
          Object.entries(r.methods as Record<string, number>)
            .map(([m, v]) => `${METHOD_LABELS[m] ?? m}: ${formatCurrency(v)}`)
            .join(' / '),
          formatCurrency(r.total),
        ]),
      );
      writeKV('TOTAL RECETTES (A)', formatCurrency(p.recetteTotal ?? 0));
    }

    // ------------------------------------------------------------------
    // II. Paiements en avance
    // ------------------------------------------------------------------
    sectionTitle('II. PAIEMENTS EN AVANCE (colis pas encore arrives a destination)');
    const advanceRoutes = Object.values((p.advancesByRouteAndMethod ?? {}) as Record<string, any>);
    if (advanceRoutes.length === 0) writeLine('Aucun paiement en avance encaisse sur cette periode.', { color: gray });
    else {
      drawTable(
        [
          { label: 'Route', width: 200 },
          { label: 'Methodes', width: 200 },
          { label: 'Total', width: pageWidth - 400, align: 'right' },
        ],
        advanceRoutes.map((r: any) => [
          `${r.routeName}${r.type ? ' (' + (TRANSIT_LABELS[r.type] ?? r.type) + ')' : ''}`,
          Object.entries(r.methods as Record<string, number>)
            .map(([m, v]) => `${METHOD_LABELS[m] ?? m}: ${formatCurrency(v)}`)
            .join(' / '),
          formatCurrency(r.total),
        ]),
      );
      writeKV('TOTAL PAIEMENTS EN AVANCE (B)', formatCurrency(p.advancesTotal ?? 0));
    }

    // ------------------------------------------------------------------
    // III. Entrees du jour par mode transit + methode
    // ------------------------------------------------------------------
    sectionTitle('III. ENTREES DU JOUR PAR MODE DE TRANSIT ET DE PAIEMENT');
    const entries = Object.values((p.entriesByTransitMethod ?? {}) as Record<string, any>);
    if (entries.length === 0) writeLine('Aucune entree enregistree.', { color: gray });
    else {
      drawTable(
        [
          { label: 'Mode transit', width: 140 },
          { label: 'Methodes', width: 260 },
          { label: 'Total', width: pageWidth - 400, align: 'right' },
        ],
        entries.map((e: any) => [
          TRANSIT_LABELS[e.type] ?? e.type,
          Object.entries(e.methods as Record<string, number>)
            .map(([m, v]) => `${METHOD_LABELS[m] ?? m}: ${formatCurrency(v)}`)
            .join(' / '),
          formatCurrency(e.total),
        ]),
      );
    }

    // ------------------------------------------------------------------
    // IV. Flux de colis du jour par route (entrees + sorties)
    // ------------------------------------------------------------------
    sectionTitle('IV. FLUX DE COLIS DU JOUR - MASSE / VOLUME PAR ROUTE');
    const renderFlowSide = (title: string, side: any) => {
      writeLine(title, { bold: true });
      const rows = Object.values((side?.byRoute ?? {}) as Record<string, any>);
      if (rows.length === 0) {
        writeLine('Aucun mouvement.', { color: gray, indent: 10 });
        return;
      }
      drawTable(
        [
          { label: 'Route', width: 180 },
          { label: 'Nombre', width: 70, align: 'right' },
          { label: 'Masse', width: 130, align: 'right' },
          { label: 'Volume', width: pageWidth - 380, align: 'right' },
        ],
        rows.map((r: any) => [
          `${r.routeName}${r.type ? ' (' + (TRANSIT_LABELS[r.type] ?? r.type) + ')' : ''}`,
          String(r.count),
          fmtWeight(r.totalWeight),
          fmtVolume(r.totalVolume),
        ]),
      );
      writeKV(
        `Sous-total ${title.toLowerCase()}`,
        `${side?.count ?? 0} colis - ${fmtWeight(side?.totalWeight ?? 0)} - ${fmtVolume(side?.totalVolume ?? 0)}`,
      );
    };
    const flow = p.flow ?? { in: p.registeredByRoute ? { byRoute: p.registeredByRoute, ...p.registeredTotal } : null, out: null };
    renderFlowSide('Entrees (colis enregistres / receptionnes)', flow.in);
    renderFlowSide('Sorties (colis ayant quitte l\'agence)', flow.out);
    // Ventilation des sorties par type (payloads recents uniquement).
    const outByType = flow.out?.byType;
    if (outByType) {
      renderFlowSide('Dont remis aux clients', outByType.handedOver);
      renderFlowSide('Dont partis en transit (charges en conteneur)', outByType.toTransit);
    }

    // ------------------------------------------------------------------
    // V. Conteneurs recus
    // ------------------------------------------------------------------
    sectionTitle('V. CONTENEURS RECUS DU JOUR');
    const received = (p.receivedContainers ?? []) as any[];
    if (received.length === 0) writeLine('Aucun conteneur recu.', { color: gray });
    else {
      for (const c of received) {
        writeLine(`${c.designation} - ${TRANSIT_LABELS[c.type] ?? c.type} - ${c.routeName} - arrive ${c.arrivalDate ? formatDateTime(c.arrivalDate) : '-'}`, { bold: true });
        const rows = Object.values(c.byRoute as Record<string, any>).map((r: any) => [
          `${r.routeName}${r.type ? ' (' + (TRANSIT_LABELS[r.type] ?? r.type) + ')' : ''}`,
          String(r.count),
          fmtWeight(r.totalWeight),
          fmtVolume(r.totalVolume),
        ]);
        if (rows.length) {
          drawTable(
            [
              { label: 'Route', width: 200 },
              { label: 'Colis', width: 70, align: 'right' },
              { label: 'Masse', width: 130, align: 'right' },
              { label: 'Volume', width: pageWidth - 400, align: 'right' },
            ],
            rows,
          );
        }
      }
    }

    // ------------------------------------------------------------------
    // VI. Conteneurs envoyes
    // ------------------------------------------------------------------
    sectionTitle('VI. CONTENEURS ENVOYES DU JOUR');
    const sent = (p.sentContainers ?? []) as any[];
    if (sent.length === 0) writeLine('Aucun conteneur envoye.', { color: gray });
    else {
      for (const c of sent) {
        writeLine(`${c.designation} - ${TRANSIT_LABELS[c.type] ?? c.type} - ${c.routeName} - depart ${c.departureDate ? formatDateTime(c.departureDate) : '-'}`, { bold: true });
        const rows = Object.values(c.byRoute as Record<string, any>).map((r: any) => [
          `${r.routeName}${r.type ? ' (' + (TRANSIT_LABELS[r.type] ?? r.type) + ')' : ''}`,
          String(r.count),
          fmtWeight(r.totalWeight),
          fmtVolume(r.totalVolume),
        ]);
        if (rows.length) {
          drawTable(
            [
              { label: 'Route', width: 200 },
              { label: 'Colis', width: 70, align: 'right' },
              { label: 'Masse', width: 130, align: 'right' },
              { label: 'Volume', width: pageWidth - 400, align: 'right' },
            ],
            rows,
          );
        }
      }
    }

    // ------------------------------------------------------------------
    // VII. Mouvements stock (in/out) par route
    // ------------------------------------------------------------------
    sectionTitle('VII. MOUVEMENTS DE STOCK PAR ROUTE');
    const renderMassVol = (title: string, agg: any) => {
      writeLine(title, { bold: true });
      const rows = Object.values((agg?.byRoute ?? {}) as Record<string, any>).map((r: any) => [
        `${r.routeName}${r.type ? ' (' + (TRANSIT_LABELS[r.type] ?? r.type) + ')' : ''}`,
        String(r.count),
        fmtWeight(r.totalWeight),
        fmtVolume(r.totalVolume),
      ]);
      if (rows.length === 0) writeLine('Aucun mouvement.', { color: gray, indent: 10 });
      else {
        drawTable(
          [
            { label: 'Route', width: 200 },
            { label: 'Colis', width: 70, align: 'right' },
            { label: 'Masse', width: 130, align: 'right' },
            { label: 'Volume', width: pageWidth - 400, align: 'right' },
          ],
          rows,
        );
        writeKV(`Sous-total ${title.toLowerCase()}`, `${fmtWeight(agg?.totalWeight ?? 0)} - ${fmtVolume(agg?.totalVolume ?? 0)}`);
      }
    };
    renderMassVol('Entrees en stock', p.stockIn);
    renderMassVol('Sorties de stock', p.stockOut);

    // ------------------------------------------------------------------
    // VIII. Etat de stock + valeur totale
    // ------------------------------------------------------------------
    sectionTitle('VIII. ETAT DE STOCK ACTUEL ET VALEUR TOTALE');
    const stockState = p.stockState ?? {};
    const stockRows = Object.values((stockState.byRoute ?? {}) as Record<string, any>).map((r: any) => [
      `${r.routeName}${r.type ? ' (' + (TRANSIT_LABELS[r.type] ?? r.type) + ')' : ''}`,
      String(r.count),
      fmtWeight(r.totalWeight),
      fmtVolume(r.totalVolume),
      formatCurrency(r.totalPrice ?? 0),
    ]);
    if (stockRows.length === 0) writeLine('Stock vide.', { color: gray });
    else {
      drawTable(
        [
          { label: 'Route', width: 180 },
          { label: 'Colis', width: 60, align: 'right' },
          { label: 'Masse', width: 110, align: 'right' },
          { label: 'Volume', width: 110, align: 'right' },
          { label: 'Valeur', width: pageWidth - 460, align: 'right' },
        ],
        stockRows,
      );
      writeKV('VALEUR TOTALE DU STOCK', formatCurrency(stockState.totalValue ?? 0));
    }

    // ------------------------------------------------------------------
    // IX. Inventaire du jour
    // ------------------------------------------------------------------
    sectionTitle('IX. INVENTAIRE(S) DU JOUR');
    const invs = (p.inventories ?? []) as any[];
    if (invs.length === 0) writeLine('Aucun inventaire effectue.', { color: gray });
    else {
      drawTable(
        [
          { label: 'Magasin', width: 180 },
          { label: 'Statut', width: 80 },
          { label: 'Attendus', width: 70, align: 'right' },
          { label: 'Scannes', width: 70, align: 'right' },
          { label: 'Manquants', width: pageWidth - 400, align: 'right' },
        ],
        invs.map((i: any) => [i.warehouse, i.status, String(i.expected), String(i.scanned), String(i.missing)]),
      );
    }

    // ------------------------------------------------------------------
    // IX-bis. Transferts de fonds
    // ------------------------------------------------------------------
    const transfersOut = (p.fundTransfersOut ?? []) as any[];
    const transfersIn = (p.fundTransfersIn ?? []) as any[];
    if (transfersOut.length > 0 || transfersIn.length > 0) {
      sectionTitle('IX-bis. TRANSFERTS DE FONDS');
      if (transfersOut.length > 0) {
        writeLine(`Sortants (${formatCurrency(p.fundTransfersOutTotal ?? 0)})`, { bold: true });
        drawTable(
          [
            { label: 'Reference', width: 130 },
            { label: 'Destination', width: 160 },
            { label: 'Methode', width: 100 },
            { label: 'Statut', width: 70 },
            { label: 'Montant', width: pageWidth - 460, align: 'right' },
          ],
          transfersOut.map((t) => [t.reference, t.counterpart, t.transferMethod, t.status, '-' + formatCurrency(t.amount)]),
        );
      }
      if (transfersIn.length > 0) {
        writeLine(`Entrants (${formatCurrency(p.fundTransfersInTotal ?? 0)})`, { bold: true });
        drawTable(
          [
            { label: 'Reference', width: 130 },
            { label: 'Source', width: 160 },
            { label: 'Methode', width: 100 },
            { label: 'Statut', width: 70 },
            { label: 'Montant', width: pageWidth - 460, align: 'right' },
          ],
          transfersIn.map((t) => [t.reference, t.counterpart, t.transferMethod, t.status, '+' + formatCurrency(t.amount)]),
        );
      }
    }

    // ------------------------------------------------------------------
    // X. Depenses
    // ------------------------------------------------------------------
    sectionTitle('X. DEPENSES DU JOUR');
    const exps = (p.expenses ?? []) as any[];
    if (exps.length === 0) writeLine('Aucune depense.', { color: gray });
    else {
      drawTable(
        [
          { label: 'Titre', width: 220 },
          { label: 'Categorie', width: 120 },
          { label: 'Montant', width: pageWidth - 340, align: 'right' },
        ],
        exps.map((e: any) => [e.title, e.category ?? '-', formatCurrency(e.amount)]),
      );
      writeKV('TOTAL DEPENSES (D)', formatCurrency(p.expensesTotal ?? 0));
    }

    // ------------------------------------------------------------------
    // XI. Resume / Solde caisse / Profit
    // ------------------------------------------------------------------
    sectionTitle('XI. RESUME DE LA SITUATION NETTE');
    writeKV('Total recettes (A)', formatCurrency(p.recetteTotal ?? 0));
    writeKV('Total paiements en avance (B)', formatCurrency(p.advancesTotal ?? 0));
    writeKV('Total depenses (D)', formatCurrency(p.expensesTotal ?? 0));
    const soldeCaisse = p.cashRegister?.closingBalance ?? p.cashRegister?.currentBalance ?? 0;
    writeKV('SOLDE CAISSE AGENCE', formatCurrency(soldeCaisse));

    const cr = p.cashRegister;
    if (cr) {
      writeLine(' ');
      writeKV('Solde d\'ouverture caisse', formatCurrency(cr.openingBalance));
      writeKV('Entrees caisse', formatCurrency(cr.totalEntries));
      writeKV('Sorties caisse', formatCurrency(cr.totalExits));
      writeKV('Solde courant caisse', formatCurrency(cr.currentBalance));
      if (cr.closingBalance != null) writeKV('Solde de cloture', formatCurrency(cr.closingBalance));
      if (cr.closedAt) writeKV('Caisse cloturee le', formatDateTime(cr.closedAt) + (cr.closedBy ? ` par ${cr.closedBy}` : ''));
    }

    // ------------------------------------------------------------------
    // Observation
    // ------------------------------------------------------------------
    if (input.observation && input.observation.trim()) {
      sectionTitle('OBSERVATIONS');
      ensureSpace(40);
      doc.font('Helvetica').fontSize(9).fillColor(dark)
        .text(input.observation, leftX, y, { width: pageWidth, align: 'left' });
      y = doc.y + 6;
    }

    // ------------------------------------------------------------------
    // Pieces jointes (libelles)
    // ------------------------------------------------------------------
    if (input.attachments && input.attachments.length > 0) {
      sectionTitle('PIECES JOINTES');
      drawTable(
        [
          { label: 'Libelle', width: 220 },
          { label: 'Fichier', width: 200 },
          { label: 'Ajoute le', width: pageWidth - 420, align: 'right' },
        ],
        input.attachments.map((a) => [
          a.caption || '(sans libelle)',
          a.fileName || '-',
          formatDate(a.createdAt),
        ]),
      );
    }

    if (input.closedByName && input.closedAt) {
      ensureSpace(20);
      writeLine(`Rapport cloture le ${formatDateTime(input.closedAt)} par ${input.closedByName}.`, { color: gray });
    }

    // Footer sur toutes les pages
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      drawFooter(i + 1, range.count);
    }

    return collectBuffer(doc);
  }
}

export const DAILY_REPORT_PDF_SERVICE = Symbol.for('DailyReportPDFService');
