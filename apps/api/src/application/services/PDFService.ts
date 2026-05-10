import PDFDocument from 'pdfkit';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface InvoiceClient {
  fullName: string;
  phone?: string | null;
  email?: string | null;
}

interface InvoiceAgency {
  name: string;
  code?: string;
  address?: string | null;
  phone?: string | null;
}

interface InvoiceParcel {
  trackingNumber: string;
  designation: string;
  weight: number;
  destination: string;
  price: number;
}

interface InvoicePayment {
  createdAt: Date | string;
  method: string;
  amount: number;
  agency?: { name: string } | null;
}

export interface InvoiceData {
  reference: string;
  createdAt: Date | string;
  client: InvoiceClient;
  agency?: InvoiceAgency | null;
  parcel: InvoiceParcel | InvoiceParcel[];
  payments: InvoicePayment[];
  totalAmount: number;
  discount: number;
  tax: number;
  netAmount: number;
  paidAmount: number;
  balance: number;
}

interface ManifestParcel {
  trackingNumber: string;
  designation: string;
  weight?: number | null;
  volume?: number | null;
  destination: string;
  destinationCity?: string | null;
  price: number;
  clientName?: string | null;
  recipientName?: string | null;
  advanceAmount?: number;
  balanceAmount?: number;
  status?: string;
}

export interface ManifestData {
  title?: string; // "BORDEREAU D'ENVOI" or "BORDEREAU DE RECEPTION"
  reference?: string;
  containerDesignation: string;
  containerType: string;
  isForwarding?: boolean;
  parentContainerName?: string | null;
  carrier?: string | null;
  transitRoute?: string | null;
  departureAgency: string;
  arrivalAgency: string;
  date: Date | string;
  parcels: ManifestParcel[];
}

export interface ComparisonData {
  reference?: string;
  containerDesignation: string;
  containerType: string;
  date: Date | string;
  dispatched: ManifestParcel[];
  received: ManifestParcel[];
  missingPhysical: Array<{ trackingNumber: string; designation: string; weight?: number | null; comment?: string | null }>;
  extraPhysical: Array<{ trackingNumber?: string; designation: string; weight?: number | null; comment?: string | null }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function collectBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'decimal',
    minimumFractionDigits: 0,
  }).format(n) + ' FCFA';
}

const COLORS = {
  primary: '#1B5E20',
  dark: '#333333',
  gray: '#666666',
  lightGray: '#EEEEEE',
  white: '#FFFFFF',
  tableBorder: '#CCCCCC',
} as const;

function drawFooter(doc: PDFKit.PDFDocument, pageWidth: number) {
  const footerY = doc.page.height - 60;
  doc
    .moveTo(50, footerY)
    .lineTo(50 + pageWidth, footerY)
    .strokeColor(COLORS.primary)
    .lineWidth(1)
    .stroke();
  doc
    .fontSize(9)
    .fillColor(COLORS.gray)
    .text('TransitSoftServices - Transit & Logistique', 50, footerY + 8, {
      align: 'center',
      width: pageWidth,
    });
}

function drawDiscrepancyTable(
  doc: PDFKit.PDFDocument,
  startY: number,
  pageWidth: number,
  rows: Array<{ trackingNumber?: string; designation?: string; weight?: number | null; comment?: string | null }>,
  accent: string,
): number {
  const cols = [
    { label: 'Tracking', width: 110 },
    { label: 'Designation', width: 160 },
    { label: 'Poids', width: 60 },
    { label: 'Commentaire', width: pageWidth - 330 },
  ];

  let y = startY;
  doc.rect(50, y, pageWidth, 20).fill(accent);
  let xCol = 55;
  doc.fontSize(8).fillColor(COLORS.white);
  for (const col of cols) {
    doc.text(col.label, xCol, y + 6, { width: col.width });
    xCol += col.width;
  }
  y += 20;

  doc.fillColor(COLORS.dark).fontSize(8);
  rows.forEach((r, i) => {
    if (y > 720) { doc.addPage(); y = 50; }
    const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
    doc.rect(50, y, pageWidth, 20).fill(bg);
    doc.fillColor(COLORS.dark);
    xCol = 55;
    const row = [
      r.trackingNumber || '-',
      r.designation || '-',
      r.weight != null ? `${Number(r.weight)} kg` : '-',
      r.comment || '-',
    ];
    for (let c = 0; c < cols.length; c++) {
      doc.text(row[c], xCol, y + 6, { width: cols[c].width - 2, lineBreak: false, ellipsis: true });
      xCol += cols[c].width;
    }
    y += 20;
  });

  return y;
}

// ---------------------------------------------------------------------------
// Invoice PDF
// ---------------------------------------------------------------------------

export class PDFService {
  static async generateInvoicePDF(invoiceData: InvoiceData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const pageWidth = doc.page.width - 100; // 50 margin each side

    // --- Header ---
    doc
      .rect(50, 40, pageWidth, 70)
      .fill(COLORS.primary);

    doc
      .fontSize(24)
      .fillColor(COLORS.white)
      .text('TRANSITSOFTSERVICES', 60, 52, { continued: true })
      .fontSize(10)
      .text('  Transit & Logistique', { baseline: 'alphabetic' });

    doc
      .fontSize(22)
      .fillColor(COLORS.white)
      .text('FACTURE', 350, 55, { align: 'right', width: pageWidth - 300 });

    // --- Reference & Date ---
    doc.fillColor(COLORS.dark);
    let y = 130;

    doc.fontSize(10).text(`Reference: ${invoiceData.reference}`, 50, y);
    doc.text(`Date: ${formatDate(invoiceData.createdAt)}`, 350, y, {
      align: 'right',
      width: pageWidth - 300,
    });

    // --- Agency info (left) / Client info (right) ---
    y = 160;
    if (invoiceData.agency) {
      doc.fontSize(9).fillColor(COLORS.gray).text('Emetteur:', 50, y);
      y += 14;
      doc.fontSize(10).fillColor(COLORS.dark).text(invoiceData.agency.name, 50, y);
      if (invoiceData.agency.address) { y += 14; doc.fontSize(9).text(invoiceData.agency.address, 50, y); }
      if (invoiceData.agency.phone) { y += 14; doc.fontSize(9).text(`Tel: ${invoiceData.agency.phone}`, 50, y); }
    }

    let yClient = 160;
    doc.fontSize(9).fillColor(COLORS.gray).text('Client:', 350, yClient, { width: pageWidth - 300 });
    yClient += 14;
    doc.fontSize(10).fillColor(COLORS.dark).text(invoiceData.client.fullName, 350, yClient, { width: pageWidth - 300 });
    if (invoiceData.client.phone) { yClient += 14; doc.fontSize(9).text(`Tel: ${invoiceData.client.phone}`, 350, yClient, { width: pageWidth - 300 }); }
    if (invoiceData.client.email) { yClient += 14; doc.fontSize(9).text(invoiceData.client.email, 350, yClient, { width: pageWidth - 300 }); }

    // --- Items table ---
    y = Math.max(y, yClient) + 30;
    const parcels = Array.isArray(invoiceData.parcel) ? invoiceData.parcel : [invoiceData.parcel];

    const cols = [
      { label: '#', width: 25 },
      { label: 'Designation', width: 140 },
      { label: 'Tracking', width: 100 },
      { label: 'Poids (kg)', width: 65 },
      { label: 'Destination', width: 90 },
      { label: 'Prix', width: 75 },
    ];

    // Table header
    doc.rect(50, y, pageWidth, 22).fill(COLORS.primary);
    let xCol = 55;
    doc.fontSize(8).fillColor(COLORS.white);
    for (const col of cols) {
      doc.text(col.label, xCol, y + 6, { width: col.width });
      xCol += col.width;
    }
    y += 22;

    // Table rows
    doc.fillColor(COLORS.dark).fontSize(8);
    parcels.forEach((p, i) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }
      const bgColor = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
      doc.rect(50, y, pageWidth, 20).fill(bgColor);

      xCol = 55;
      doc.fillColor(COLORS.dark);
      const row = [
        String(i + 1),
        p.designation || '-',
        p.trackingNumber || '-',
        String(p.weight ?? '-'),
        p.destination || '-',
        formatCurrency(Number(p.price) || 0),
      ];
      for (let c = 0; c < cols.length; c++) {
        doc.text(row[c], xCol, y + 5, { width: cols[c].width, lineBreak: false });
        xCol += cols[c].width;
      }
      y += 20;
    });

    // --- Financial summary ---
    y += 15;
    const summaryX = 320;
    const summaryW = pageWidth - 270;
    const summaryLines: [string, string][] = [
      ['Total', formatCurrency(invoiceData.totalAmount)],
      ['Remise', formatCurrency(invoiceData.discount)],
      ['TVA', formatCurrency(invoiceData.tax)],
      ['Net a payer', formatCurrency(invoiceData.netAmount)],
      ['Montant paye', formatCurrency(invoiceData.paidAmount)],
      ['Solde', formatCurrency(invoiceData.balance)],
    ];

    for (const [label, value] of summaryLines) {
      const isBold = label === 'Net a payer' || label === 'Solde';
      doc.fontSize(isBold ? 10 : 9).fillColor(COLORS.dark);
      if (isBold) {
        doc.rect(summaryX - 5, y - 2, summaryW + 10, 18).fill(COLORS.lightGray);
        doc.fillColor(COLORS.dark);
      }
      doc.text(label, summaryX, y, { continued: false });
      doc.text(value, summaryX + 120, y, { width: summaryW - 120, align: 'right' });
      y += 18;
    }

    // --- Payment history ---
    if (invoiceData.payments && invoiceData.payments.length > 0) {
      y += 15;
      if (y > 680) { doc.addPage(); y = 50; }
      doc.fontSize(11).fillColor(COLORS.primary).text('Historique des paiements', 50, y);
      y += 20;

      const payCols = [
        { label: 'Date', width: 90 },
        { label: 'Methode', width: 100 },
        { label: 'Montant', width: 100 },
        { label: 'Agence', width: 140 },
      ];
      doc.rect(50, y, pageWidth, 20).fill(COLORS.primary);
      xCol = 55;
      doc.fontSize(8).fillColor(COLORS.white);
      for (const col of payCols) {
        doc.text(col.label, xCol, y + 5, { width: col.width });
        xCol += col.width;
      }
      y += 20;

      doc.fillColor(COLORS.dark).fontSize(8);
      invoiceData.payments.forEach((p, i) => {
        if (y > 750) { doc.addPage(); y = 50; }
        const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
        doc.rect(50, y, pageWidth, 18).fill(bg);
        doc.fillColor(COLORS.dark);
        xCol = 55;
        const payRow = [
          formatDate(p.createdAt),
          p.method || '-',
          formatCurrency(Number(p.amount)),
          p.agency?.name || '-',
        ];
        for (let c = 0; c < payCols.length; c++) {
          doc.text(payRow[c], xCol, y + 4, { width: payCols[c].width, lineBreak: false });
          xCol += payCols[c].width;
        }
        y += 18;
      });
    }

    // --- Footer ---
    const footerY = doc.page.height - 60;
    doc
      .moveTo(50, footerY)
      .lineTo(50 + pageWidth, footerY)
      .strokeColor(COLORS.primary)
      .lineWidth(1)
      .stroke();
    doc
      .fontSize(9)
      .fillColor(COLORS.gray)
      .text('TransitSoftServices - Transit & Logistique', 50, footerY + 8, {
        align: 'center',
        width: pageWidth,
      });

    return collectBuffer(doc);
  }

  // -------------------------------------------------------------------------
  // Manifest / Bordereau PDF
  // -------------------------------------------------------------------------

  static async generateManifestPDF(manifestData: ManifestData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const pageWidth = doc.page.width - 100;
    const title = manifestData.title || "BORDEREAU D'ENVOI";

    // --- Header ---
    doc.rect(50, 40, pageWidth, 60).fill(COLORS.primary);
    doc
      .fontSize(18)
      .fillColor(COLORS.white)
      .text(title, 60, 50, { width: pageWidth - 20, align: 'center' });
    if (manifestData.reference) {
      doc.fontSize(10).fillColor(COLORS.white).text(
        `Reference: ${manifestData.reference}`,
        60,
        78,
        { width: pageWidth - 20, align: 'center' },
      );
    }

    // --- Container info ---
    let y = 120;
    doc.fillColor(COLORS.dark).fontSize(10);
    doc.text(`Date: ${formatDate(manifestData.date)}`, 50, y);
    y += 18;
    doc.text(`Conteneur: ${manifestData.containerDesignation}`, 50, y);
    const typeLabel = manifestData.isForwarding
      ? `${manifestData.containerType} (Acheminement)`
      : manifestData.containerType;
    doc.text(`Type: ${typeLabel}`, 300, y, { width: pageWidth - 250 });
    y += 18;
    if (manifestData.parentContainerName) {
      doc.text(`Conteneur parent: ${manifestData.parentContainerName}`, 50, y);
      y += 18;
    }
    if (manifestData.carrier) {
      doc.text(`Transporteur: ${manifestData.carrier}`, 50, y);
    }
    if (manifestData.transitRoute) {
      doc.text(`Route: ${manifestData.transitRoute}`, 300, y, { width: pageWidth - 250 });
    }
    if (manifestData.carrier || manifestData.transitRoute) y += 18;
    doc.text(`Agence depart: ${manifestData.departureAgency}`, 50, y);
    doc.text(`Agence arrivee: ${manifestData.arrivalAgency}`, 300, y, { width: pageWidth - 250 });

    // --- Parcels table ---
    y += 30;
    const parcels = manifestData.parcels ?? [];

    if (parcels.length === 0) {
      doc.fontSize(10).fillColor(COLORS.gray).text(
        'Aucun colis dans ce conteneur.',
        50,
        y,
        { width: pageWidth, align: 'center' },
      );
      y += 30;
    } else {
      const cols = [
        { label: '#', width: 18 },
        { label: 'Tracking', width: 70 },
        { label: 'Designation', width: 78 },
        { label: 'Client', width: 70 },
        { label: 'Destinataire', width: 70 },
        { label: 'Ville', width: 60 },
        { label: 'P/V', width: 45 },
        { label: 'A payer', width: 55 },
        { label: 'Avance', width: 50 },
      ];
      const tableWidth = cols.reduce((s, c) => s + c.width, 0);

      doc.rect(50, y, tableWidth, 22).fill(COLORS.primary);
      let xCol = 55;
      doc.fontSize(7).fillColor(COLORS.white);
      for (const col of cols) {
        doc.text(col.label, xCol, y + 7, { width: col.width - 2 });
        xCol += col.width;
      }
      y += 22;

      doc.fillColor(COLORS.dark).fontSize(7);
      parcels.forEach((p, i) => {
        if (y > 700) { doc.addPage(); y = 50; }
        const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
        const rowH = 22;
        doc.rect(50, y, tableWidth, rowH).fill(bg);
        doc.fillColor(COLORS.dark);
        xCol = 55;

        const pv = p.weight != null
          ? `${Number(p.weight)} kg`
          : p.volume != null
            ? `${Number(p.volume)} m3`
            : '-';

        const row: string[] = [
          String(i + 1),
          p.trackingNumber || '-',
          p.designation || '-',
          p.clientName || '-',
          p.recipientName || '-',
          p.destinationCity || p.destination || '-',
          pv,
          formatCurrency(Number(p.price) || 0),
          formatCurrency(Number(p.advanceAmount) || 0),
        ];
        for (let c = 0; c < cols.length; c++) {
          doc.text(row[c], xCol, y + 6, { width: cols[c].width - 2, lineBreak: false, ellipsis: true });
          xCol += cols[c].width;
        }
        y += rowH;
      });
    }

    // --- Summary ---
    y += 15;
    if (y > 680) { doc.addPage(); y = 50; }
    const totalParcels = parcels.length;
    const totalWeight = parcels.reduce((s, p) => s + (Number(p.weight) || 0), 0);
    const totalVolume = parcels.reduce((s, p) => s + (Number(p.volume) || 0), 0);
    const totalValue = parcels.reduce((s, p) => s + (Number(p.price) || 0), 0);
    const totalAdvance = parcels.reduce((s, p) => s + (Number(p.advanceAmount) || 0), 0);

    doc.rect(50, y, pageWidth, 95).fill(COLORS.lightGray);
    doc.fontSize(10).fillColor(COLORS.dark);
    doc.text(`Total colis: ${totalParcels}`, 60, y + 10);
    doc.text(`Poids total: ${totalWeight.toFixed(2)} kg`, 60, y + 28);
    if (totalVolume > 0) {
      doc.text(`Volume total: ${totalVolume.toFixed(3)} m3`, 60, y + 46);
    }
    doc.text(`Valeur totale: ${formatCurrency(totalValue)}`, 300, y + 10);
    doc
      .fontSize(11)
      .fillColor(COLORS.primary)
      .text(`Total attendu (avances): ${formatCurrency(totalAdvance)}`, 300, y + 32);
    doc.fontSize(10).fillColor(COLORS.dark);

    // --- Signatures ---
    y += 125;
    if (y > 720) { doc.addPage(); y = 50; }

    doc.fontSize(10).fillColor(COLORS.dark);
    doc.text('Expediteur:', 60, y);
    doc.text('Recepteur:', 330, y);
    y += 40;
    doc.moveTo(60, y).lineTo(220, y).strokeColor(COLORS.dark).stroke();
    doc.moveTo(330, y).lineTo(490, y).strokeColor(COLORS.dark).stroke();

    drawFooter(doc, pageWidth);
    return collectBuffer(doc);
  }

  // -------------------------------------------------------------------------
  // Bordereau de comparaison (envoi vs reception + ecarts)
  // -------------------------------------------------------------------------

  static async generateComparisonPDF(data: ComparisonData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const pageWidth = doc.page.width - 100;

    doc.rect(50, 40, pageWidth, 60).fill(COLORS.primary);
    doc
      .fontSize(18)
      .fillColor(COLORS.white)
      .text('BORDEREAU DE COMPARAISON', 60, 50, { width: pageWidth - 20, align: 'center' });
    if (data.reference) {
      doc.fontSize(10).fillColor(COLORS.white).text(
        `Ref: ${data.reference}`,
        60, 78, { width: pageWidth - 20, align: 'center' },
      );
    }

    let y = 120;
    doc.fillColor(COLORS.dark).fontSize(10);
    doc.text(`Date: ${formatDate(data.date)}`, 50, y);
    doc.text(`Conteneur: ${data.containerDesignation} (${data.containerType})`, 250, y);

    y += 28;

    // Resume
    const dispatchedCount = data.dispatched.length;
    const receivedCount = data.received.length;
    const missingCount = data.missingPhysical.length;
    const extraCount = data.extraPhysical.length;

    doc.rect(50, y, pageWidth, 55).fill(COLORS.lightGray);
    doc.fontSize(10).fillColor(COLORS.dark);
    doc.text(`Colis envoyes: ${dispatchedCount}`, 60, y + 10);
    doc.text(`Colis recus: ${receivedCount}`, 200, y + 10);
    doc.fontSize(10).fillColor(missingCount > 0 ? '#B71C1C' : COLORS.dark)
      .text(`Manquants physiques: ${missingCount}`, 60, y + 32);
    doc.fillColor(extraCount > 0 ? '#B71C1C' : COLORS.dark)
      .text(`Excedents physiques: ${extraCount}`, 250, y + 32);

    y += 75;

    // --- Colis manquants physiquement (declarés mais absents) ---
    doc.fillColor(COLORS.dark).fontSize(11)
      .text('1. Colis declares en ligne mais absents physiquement', 50, y);
    y += 18;
    if (data.missingPhysical.length === 0) {
      doc.fontSize(9).fillColor(COLORS.gray).text('Aucun ecart.', 50, y);
      y += 14;
    } else {
      y = drawDiscrepancyTable(doc, y, pageWidth, data.missingPhysical, '#B71C1C');
    }

    y += 10;
    if (y > 680) { doc.addPage(); y = 50; }

    // --- Colis trouves physiquement mais non enregistres ---
    doc.fillColor(COLORS.dark).fontSize(11)
      .text('2. Colis trouves physiquement mais non enregistres en ligne', 50, y);
    y += 18;
    if (data.extraPhysical.length === 0) {
      doc.fontSize(9).fillColor(COLORS.gray).text('Aucun ecart.', 50, y);
      y += 14;
    } else {
      y = drawDiscrepancyTable(doc, y, pageWidth, data.extraPhysical, '#E65100');
    }

    drawFooter(doc, pageWidth);
    return collectBuffer(doc);
  }

  // -------------------------------------------------------------------------
  // Parcel Label PDF (QR + info)
  // -------------------------------------------------------------------------

  static async generateLabelPDF(
    parcel: {
      trackingNumber: string;
      designation: string;
      weight?: number | null;
      volume?: number | null;
      destination: string;
      origin?: string | null;
      clientName: string;
      clientPhone?: string | null;
      recipientName?: string | null;
      recipientPhone?: string | null;
      transitRoute?: string | null;
      transitType?: string | null;
      agencyName?: string | null;
      observation?: string | null;
      price?: number | null;
      // Marquages speciaux pour la manutention. Affiches en haut de l'etiquette
      // et signales par une bordure speciale autour du PDF.
      isFragile?: boolean;
      isHazardous?: boolean;
    },
    qrBuffer: Buffer,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: [283, 425], margin: 15 }); // ~100x150mm label
    const w = 283 - 30;
    const pageW = 283;
    const pageH = 425;

    // ----- Bordure speciale fragile / dangereux ------
    // Hazardous = bordure rouge double + bandes diagonales hachurees
    // (TRANSPORT DE MARCHANDISES DANGEREUSES bien visible).
    if (parcel.isHazardous) {
      // Double bordure rouge
      doc.rect(2, 2, pageW - 4, pageH - 4).strokeColor('#C62828').lineWidth(2.5).stroke();
      doc.rect(7, 7, pageW - 14, pageH - 14).strokeColor('#C62828').lineWidth(1).stroke();
      // Hachures diagonales sur les coins (motif "danger")
      const stripeStep = 8;
      doc.strokeColor('#C62828').lineWidth(1.5);
      // coin haut-gauche
      for (let i = 0; i < 30; i += stripeStep) {
        doc.moveTo(2 + i, 2).lineTo(2, 2 + i).stroke();
      }
      // coin haut-droit
      for (let i = 0; i < 30; i += stripeStep) {
        doc.moveTo(pageW - 2 - i, 2).lineTo(pageW - 2, 2 + i).stroke();
      }
      // coin bas-gauche
      for (let i = 0; i < 30; i += stripeStep) {
        doc.moveTo(2, pageH - 2 - i).lineTo(2 + i, pageH - 2).stroke();
      }
      // coin bas-droit
      for (let i = 0; i < 30; i += stripeStep) {
        doc.moveTo(pageW - 2, pageH - 2 - i).lineTo(pageW - 2 - i, pageH - 2).stroke();
      }
    } else if (parcel.isFragile) {
      // Bordure orange-jaune simple (manipulation prudente, pas dangereux).
      doc.rect(3, 3, pageW - 6, pageH - 6).strokeColor('#F57C00').lineWidth(2).stroke();
    }

    // ----- Bandeaux d'alerte (fragile + hazardous) en haut, AVANT le header -----
    // On decale le contenu vers le bas si une bande est presente.
    let topOffset = 10;
    if (parcel.isHazardous) {
      doc.rect(15, topOffset, w, 16).fill('#C62828');
      doc.fontSize(9).fillColor(COLORS.white).text(
        '!!  MARCHANDISE DANGEREUSE  !!',
        15, topOffset + 4, { width: w, align: 'center' },
      );
      topOffset += 18;
    }
    if (parcel.isFragile) {
      doc.rect(15, topOffset, w, 16).fill('#F57C00');
      doc.fontSize(9).fillColor(COLORS.white).text(
        'FRAGILE - MANIPULER AVEC SOIN',
        15, topOffset + 4, { width: w, align: 'center' },
      );
      topOffset += 18;
    }

    // Header
    doc.rect(15, topOffset, w, 28).fill(COLORS.primary);
    doc.fontSize(12).fillColor(COLORS.white).text(
      'TRANSITSOFTSERVICES',
      18, topOffset + 7, { width: w - 6, align: 'center' },
    );

    // QR code (decale si bandeaux)
    const qrY = topOffset + 32;
    doc.image(qrBuffer, 92, qrY, { width: 100 });

    // Tracking number
    const trackingY = topOffset + 138;
    doc.fontSize(11).fillColor(COLORS.dark).text(
      parcel.trackingNumber,
      15, trackingY, { width: w, align: 'center' },
    );

    // Separator
    const sepY = topOffset + 155;
    doc.moveTo(20, sepY).lineTo(15 + w - 5, sepY).strokeColor(COLORS.lightGray).lineWidth(0.5).stroke();

    // Pesee / mesure
    const pv = parcel.weight != null ? `${Number(parcel.weight)} kg` : parcel.volume != null ? `${Number(parcel.volume)} m3` : '-';

    let y = topOffset + 162;
    const lines: [string, string][] = [
      ['Designation', parcel.designation],
      ['Pesee', pv],
      ['Origine', parcel.origin || parcel.agencyName || '-'],
      ['Destination', parcel.destination],
      ['Route', parcel.transitRoute ? `${parcel.transitRoute}${parcel.transitType ? ` (${parcel.transitType})` : ''}` : '-'],
      ['Expediteur', `${parcel.clientName}${parcel.clientPhone ? ` - ${parcel.clientPhone}` : ''}`],
      ['Destinataire', parcel.recipientName ? `${parcel.recipientName}${parcel.recipientPhone ? ` - ${parcel.recipientPhone}` : ''}` : '-'],
    ];

    doc.fontSize(7.5);
    for (const [label, value] of lines) {
      doc.fillColor(COLORS.gray).text(label, 20, y, { width: 60 });
      doc.fillColor(COLORS.dark).text(value, 80, y, { width: w - 70, ellipsis: true, lineBreak: false });
      y += 13;
    }

    if (parcel.observation) {
      y += 4;
      doc.fillColor(COLORS.gray).text('Note', 20, y, { width: 60 });
      doc.fillColor(COLORS.dark).text(parcel.observation, 80, y, { width: w - 70, height: 24, ellipsis: true });
      y += 18;
    }

    if (parcel.price != null && parcel.price > 0) {
      doc.rect(20, y, w - 10, 18).fill(COLORS.lightGray);
      doc.fontSize(9).fillColor(COLORS.dark).text(
        `Montant: ${formatCurrency(Number(parcel.price))}`,
        25, y + 4, { width: w - 20, align: 'left' },
      );
    }

    // Footer line
    doc.moveTo(15, 395).lineTo(15 + w, 395).strokeColor(COLORS.primary).lineWidth(0.5).stroke();
    doc.fontSize(6).fillColor(COLORS.gray).text(
      'TransitSoftServices - Transit & Logistique',
      15, 400, { width: w, align: 'center' },
    );

    return collectBuffer(doc);
  }
}
