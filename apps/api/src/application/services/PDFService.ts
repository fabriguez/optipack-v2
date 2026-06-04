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
  /** Destinataire prevu pour ce colis (peut differer du client payeur). */
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  // Masse en kg, null pour les colis tarifes par volume uniquement.
  weight: number | null;
  // Volume en m3, null pour les colis tarifes par masse uniquement.
  volume?: number | null;
  destination: string;
  price: number;
  // Detail transit affiche en facture.
  transitRouteName?: string | null;
  transitType?: string | null;
  origin?: string | null;
  // Frais de magasinage propres au colis (jours payants x tarif jour). Affiches
  // dans le PDF sous la forme "+ NNN FCFA frais magasinage (N jrs)" quand > 0.
  storageFee?: number;
  storageDays?: number;
  storageFreeDays?: number;
  storageDailyRate?: number;
  storageWarehouseName?: string | null;
  storageReason?: string | null;
  /** Lignes detaillees de magasinage : 1 par periode/magasin/phase. */
  storageLines?: InvoiceStorageLine[];
  // URLs des images du colis (max 3) -- buffers prechargees rendues en facture.
  imageUrls?: string[];
  /** Buffers des images (preremplis par l'appelant). */
  imageBuffers?: Buffer[];
}

export interface InvoiceStorageLine {
  warehouseName: string | null;
  warehouseCity: string | null;
  phase: 'DEPARTURE' | 'TRANSIT' | 'DESTINATION';
  startedAt: Date | string;
  endedAt: Date | string;
  isActive: boolean;
  dailyRate: number;
  freeDays: number;
  chargedDays: number;
  feeAmount: number;
  ruleLabel: string | null;
  stopReason: string | null;
}

interface InvoicePayment {
  createdAt: Date | string;
  method: string;
  amount: number;
  agency?: { name: string } | null;
}

export interface InvoiceDiscountEntry {
  createdAt: Date | string;
  action: 'DISCOUNT_APPLIED' | 'DISCOUNT_REMOVED' | string;
  previousDiscount: number;
  newDiscount: number;
  reason: string | null;
  userName?: string | null;
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
  // Total des frais de magasinage cumules sur tous les colis de la facture.
  // Si > 0, on affiche une ligne dediee dans le bloc total.
  storageFeesTotal?: number;
  // Historique des remises (audit log). Affiche en bas de la facture.
  discountHistory?: InvoiceDiscountEntry[];
  /** Branding tenant pour entete/pied de la facture. */
  branding?: PDFBranding | null;
}

interface ManifestParcel {
  trackingNumber: string;
  designation: string;
  weight?: number | null;
  volume?: number | null;
  destination: string;
  destinationCity?: string | null;
  // Route de transit propre au colis (snapshote sur la ligne de bordereau).
  // Si null, on retombe sur la route du conteneur (au niveau du rendu).
  transit?: string | null;
  price: number;
  clientName?: string | null;
  clientPhone?: string | null;
  clientEmail?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
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
  /** Branding tenant pour entete/pied du bordereau. */
  branding?: PDFBranding | null;
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
  /** Branding tenant pour entete/pied. */
  branding?: PDFBranding | null;
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
  // Groupement millier manuel (espace ASCII) : U+202F de Intl-fr rend un
  // glyphe parasite dans la police pdfkit Helvetica.
  const v = Math.round(Number.isFinite(n) ? n : 0);
  const sign = v < 0 ? "-" : "";
  const grouped = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${grouped} FCFA`;
}

const COLORS = {
  primary: '#1B5E20',
  dark: '#333333',
  gray: '#666666',
  lightGray: '#EEEEEE',
  white: '#FFFFFF',
  tableBorder: '#CCCCCC',
} as const;

/**
 * Branding tenant pour entête/pied des documents imprimables.
 * Le primaryColor override COLORS.primary localement (par doc).
 */
export interface PDFBranding {
  organizationName: string | null;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
  organizationAddress?: string | null;
  /** Bytes du logo organisation (precharges depuis MinIO par l'appelant). */
  logoBuffer?: Buffer | null;
  /** Couleur principale (#hex). Override le COLORS.primary par defaut. */
  primaryColor?: string | null;
}

/**
 * Dessine une entete brandee pour le document : logo + nom du tenant +
 * titre du document + meta lignes (reference, date, ...). Retourne le Y
 * sous la zone d'entete pour continuer le rendu.
 */
function drawBrandedHeader(
  doc: PDFKit.PDFDocument,
  pageWidth: number,
  opts: {
    branding?: PDFBranding | null;
    title: string;
    metaLines?: Array<string | null | undefined>;
  },
): number {
  const branding = opts.branding ?? {} as PDFBranding;
  const primary = branding.primaryColor || COLORS.primary;
  // Bandeau couleur tenant
  doc.rect(0, 0, doc.page.width, 90).fill(primary);

  // Logo a gauche si fourni
  const leftX = 50;
  if (branding.logoBuffer) {
    try {
      doc.image(branding.logoBuffer, leftX, 16, { fit: [58, 58] });
    } catch { /* logo invalide -> skip */ }
  }
  const textX = branding.logoBuffer ? leftX + 70 : leftX;

  // Nom tenant
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text((branding.organizationName || 'OptiPack').toUpperCase(), textX, 18, {
      width: pageWidth - (textX - leftX),
    });

  // Coordonnees tenant
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.white);
  const contactBits: string[] = [];
  if (branding.organizationAddress) contactBits.push(branding.organizationAddress);
  if (branding.organizationPhone) contactBits.push(`Tel: ${branding.organizationPhone}`);
  if (branding.organizationEmail) contactBits.push(branding.organizationEmail);
  if (contactBits.length > 0) {
    doc.text(contactBits.join('  ·  '), textX, 42, {
      width: pageWidth - (textX - leftX),
      lineBreak: false,
      ellipsis: true,
    });
  }

  // Bandeau titre du document
  const titleY = 100;
  doc.rect(50, titleY, pageWidth, 32).fillAndStroke(COLORS.lightGray, primary);
  doc
    .fillColor(primary)
    .font('Helvetica-Bold')
    .fontSize(14)
    .text(opts.title, 60, titleY + 5, { width: pageWidth - 20 });

  // Meta lignes a droite (reference, date)
  const metaLines = (opts.metaLines ?? []).filter((m): m is string => !!m);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.dark);
  metaLines.forEach((line, idx) => {
    doc.text(line, 60, titleY + 18 + idx * 11, { width: pageWidth - 20, align: 'right' });
  });

  return titleY + 40;
}

function drawFooter(doc: PDFKit.PDFDocument, pageWidth: number, branding?: PDFBranding | null) {
  const primary = branding?.primaryColor || COLORS.primary;
  const footerY = doc.page.height - 60;
  doc
    .moveTo(50, footerY)
    .lineTo(50 + pageWidth, footerY)
    .strokeColor(primary)
    .lineWidth(1)
    .stroke();

  // Ligne 1 : tenant (si different de TransitSoftServices)
  const tenantName = branding?.organizationName;
  if (tenantName && tenantName.toLowerCase() !== 'transitsoftservices') {
    const tenantBits = [tenantName];
    if (branding?.organizationEmail) tenantBits.push(branding.organizationEmail);
    if (branding?.organizationPhone) tenantBits.push(branding.organizationPhone);
    doc
      .fontSize(8)
      .fillColor(COLORS.dark)
      .text(tenantBits.join(' · '), 50, footerY + 6, {
        align: 'center',
        width: pageWidth,
      });
  }

  // Ligne 2 : signature TransitSoftServices (toujours)
  doc
    .fontSize(8)
    .fillColor(COLORS.gray)
    .text(
      'Propulse par TransitSoftServices - Transit & Logistique',
      50,
      footerY + (tenantName && tenantName.toLowerCase() !== 'transitsoftservices' ? 20 : 8),
      { align: 'center', width: pageWidth },
    );
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
// Payment receipt (recu de paiement)
// ---------------------------------------------------------------------------

export interface ReceiptData {
  /** Reference unique du paiement. */
  reference: string;
  createdAt: Date | string;
  amount: number;
  method: string;
  transactionReference?: string | null;
  client: InvoiceClient;
  agency?: InvoiceAgency | null;
  /** Facture reglee par ce paiement (etat apres encaissement). */
  invoice: {
    reference: string;
    netAmount: number;
    paidAmount: number;
    balance: number;
  };
  /** Colis precis si le paiement est scope a un colis (sinon toute la facture). */
  parcel?: { trackingNumber: string; designation: string } | null;
  /** Agent ayant encaisse le paiement. */
  receivedByName?: string | null;
  branding?: PDFBranding | null;
}

// ---------------------------------------------------------------------------
// Invoice PDF
// ---------------------------------------------------------------------------

export class PDFService {
  /**
   * Recu de paiement (justificatif d'encaissement) pour le portail client.
   * Une page A4 : entete brandee, bloc client/agence, montant encaisse en
   * evidence, details (mode, reference transaction, colis), etat de la facture
   * apres paiement.
   */
  static async generatePaymentReceiptPDF(data: ReceiptData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const pageWidth = doc.page.width - 100;
    const primary = data.branding?.primaryColor || COLORS.primary;

    let y = drawBrandedHeader(doc, pageWidth, {
      branding: data.branding,
      title: 'RECU DE PAIEMENT',
      metaLines: [
        `Recu N: ${data.reference}`,
        `Date: ${formatDate(data.createdAt)}`,
      ],
    });

    y += 10;

    // Bloc emetteur (agence) / client
    if (data.agency) {
      doc.fontSize(9).fillColor(COLORS.gray).text('Emetteur:', 50, y);
      let ya = y + 14;
      doc.fontSize(10).fillColor(COLORS.dark).text(data.agency.name, 50, ya);
      if (data.agency.address) { ya += 14; doc.fontSize(9).text(data.agency.address, 50, ya); }
      if (data.agency.phone) { ya += 14; doc.fontSize(9).text(`Tel: ${data.agency.phone}`, 50, ya); }
    }

    let yc = y;
    doc.fontSize(9).fillColor(COLORS.gray).text('Recu de:', 350, yc, { width: pageWidth - 300 });
    yc += 14;
    doc.fontSize(10).fillColor(COLORS.dark).text(data.client.fullName, 350, yc, { width: pageWidth - 300 });
    if (data.client.phone) { yc += 14; doc.fontSize(9).text(`Tel: ${data.client.phone}`, 350, yc, { width: pageWidth - 300 }); }
    if (data.client.email) { yc += 14; doc.fontSize(9).text(data.client.email, 350, yc, { width: pageWidth - 300 }); }

    y = Math.max(y + 70, yc + 24);

    // Montant encaisse en evidence
    doc.rect(50, y, pageWidth, 50).fillAndStroke(COLORS.lightGray, primary);
    doc.fillColor(COLORS.gray).font('Helvetica').fontSize(10)
      .text('Montant encaisse', 65, y + 9);
    doc.fillColor(primary).font('Helvetica-Bold').fontSize(22)
      .text(formatCurrency(data.amount), 65, y + 22, { width: pageWidth - 30 });
    doc.font('Helvetica');
    y += 70;

    // Details du paiement
    const detailRows: Array<[string, string]> = [
      ['Mode de paiement', data.method || '-'],
      ['Facture', data.invoice.reference],
    ];
    if (data.parcel) {
      detailRows.push(['Colis', `${data.parcel.trackingNumber} - ${data.parcel.designation}`]);
    }
    if (data.transactionReference) {
      detailRows.push(['Reference transaction', data.transactionReference]);
    }
    if (data.receivedByName) {
      detailRows.push(['Encaisse par', data.receivedByName]);
    }

    doc.fontSize(11).fillColor(primary).font('Helvetica-Bold').text('Details', 50, y);
    y += 20;
    doc.font('Helvetica').fontSize(10);
    detailRows.forEach(([label, value], i) => {
      const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
      doc.rect(50, y, pageWidth, 20).fill(bg);
      doc.fillColor(COLORS.gray).text(label, 60, y + 6, { width: 180 });
      doc.fillColor(COLORS.dark).text(value, 240, y + 6, { width: pageWidth - 200, lineBreak: false, ellipsis: true });
      y += 20;
    });

    y += 16;

    // Etat de la facture apres paiement
    doc.fontSize(11).fillColor(primary).font('Helvetica-Bold').text('Etat de la facture', 50, y);
    y += 20;
    doc.font('Helvetica').fontSize(10);
    const stateRows: Array<[string, string]> = [
      ['Montant facture', formatCurrency(data.invoice.netAmount)],
      ['Total regle', formatCurrency(data.invoice.paidAmount)],
      ['Reste a payer', formatCurrency(data.invoice.balance)],
    ];
    stateRows.forEach(([label, value], i) => {
      const last = i === stateRows.length - 1;
      doc.fillColor(COLORS.gray).font(last ? 'Helvetica-Bold' : 'Helvetica').text(label, 60, y, { width: 180 });
      doc.fillColor(last && data.invoice.balance > 0 ? '#B71C1C' : COLORS.dark)
        .font(last ? 'Helvetica-Bold' : 'Helvetica')
        .text(value, 240, y, { width: pageWidth - 200, align: 'left' });
      y += 18;
    });

    drawFooter(doc, pageWidth, data.branding);
    return collectBuffer(doc);
  }

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
      { label: 'Designation', width: 130 },
      { label: 'Tracking', width: 90 },
      { label: 'Masse / Volume', width: 80 },
      { label: 'Destination', width: 90 },
      { label: 'Prix', width: 80 },
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
      const massVol: string[] = [];
      if (p.weight != null && Number(p.weight) > 0) massVol.push(`${Number(p.weight).toFixed(1)} kg`);
      if (p.volume != null && Number(p.volume) > 0) massVol.push(`${Number(p.volume).toFixed(3)} m3`);
      const row = [
        String(i + 1),
        p.designation || '-',
        p.trackingNumber || '-',
        massVol.length > 0 ? massVol.join(' / ') : '-',
        p.destination || '-',
        formatCurrency(Number(p.price) || 0),
      ];
      for (let c = 0; c < cols.length; c++) {
        doc.text(row[c], xCol, y + 5, { width: cols[c].width, lineBreak: false });
        xCol += cols[c].width;
      }
      y += 20;
    });

    // --- Detail par colis : transit + magasinage + images ---
    y += 14;
    if (y > 660) { doc.addPage(); y = 50; }
    doc.fontSize(11).fillColor(COLORS.primary).text('Details des colis', 50, y);
    y += 18;

    for (const p of parcels) {
      // Reserve assez de hauteur pour le bloc colis (~ 90px sans images).
      const needed = 90 + ((p.imageBuffers?.length ?? 0) > 0 ? 70 : 0);
      if (y + needed > 750) { doc.addPage(); y = 50; }

      // Header colis
      doc.rect(50, y, pageWidth, 18).fill(COLORS.lightGray);
      doc.fillColor(COLORS.dark).fontSize(9).font('Helvetica-Bold')
        .text(`${p.trackingNumber} - ${p.designation || '-'}`, 55, y + 5, { width: pageWidth - 10 });
      y += 22;

      doc.font('Helvetica').fontSize(8).fillColor(COLORS.dark);
      // Ligne 1 : transit
      const transitParts: string[] = [];
      if (p.transitRouteName) transitParts.push(`Route: ${p.transitRouteName}`);
      if (p.transitType) transitParts.push(`Mode: ${p.transitType}`);
      const route = transitParts.join('  ·  ') || 'Transit non defini';
      doc.text(route, 55, y, { width: pageWidth - 10, lineBreak: false, ellipsis: true });
      y += 11;
      // Ligne 2 : origine -> destination
      const od = `${p.origin || '-'}  →  ${p.destination || '-'}`;
      doc.text(od, 55, y, { width: pageWidth - 10, lineBreak: false, ellipsis: true });
      y += 11;
      // Ligne 2bis : destinataire (peut differer du client payeur)
      if (p.recipientName) {
        const recBits = [`Destinataire: ${p.recipientName}`];
        if (p.recipientPhone) recBits.push(p.recipientPhone);
        if (p.recipientEmail) recBits.push(p.recipientEmail);
        doc.text(recBits.join('  ·  '), 55, y, { width: pageWidth - 10, lineBreak: false, ellipsis: true });
        y += 11;
      }
      // Ligne 3 : masse/volume + prix transport
      const mv: string[] = [];
      if (p.weight != null && Number(p.weight) > 0) mv.push(`${Number(p.weight).toFixed(2)} kg`);
      if (p.volume != null && Number(p.volume) > 0) mv.push(`${Number(p.volume).toFixed(3)} m3`);
      doc.text(
        `${mv.join(' / ') || '-'}    Prix transport : ${formatCurrency(Number(p.price) || 0)}`,
        55, y, { width: pageWidth - 10, lineBreak: false },
      );
      y += 13;

      // Magasinage : toujours afficher (raison + calcul). Si fee=0, indiquer.
      const wn = p.storageWarehouseName ?? '-';
      doc.fillColor(COLORS.primary).fontSize(8).font('Helvetica-Bold')
        .text('Magasinage', 55, y);
      y += 10;
      doc.fillColor(COLORS.dark).font('Helvetica').fontSize(7.5);
      doc.text(`Lieu : ${wn}`, 55, y, { width: pageWidth - 10 });
      y += 9;
      if (p.storageReason) {
        doc.text(p.storageReason, 55, y, { width: pageWidth - 10 });
        y += 9;
      }
      doc.font('Helvetica-Bold').text(
        `Montant magasinage : ${formatCurrency(p.storageFee ?? 0)}`,
        55, y, { width: pageWidth - 10 },
      );
      y += 12;

      // Images du colis
      if (p.imageBuffers && p.imageBuffers.length > 0) {
        const imgY = y;
        const imgW = 80;
        const imgH = 60;
        const gap = 8;
        let xImg = 55;
        for (let i = 0; i < Math.min(3, p.imageBuffers.length); i++) {
          try {
            doc.image(p.imageBuffers[i], xImg, imgY, { fit: [imgW, imgH] });
          } catch { /* skip image errors */ }
          xImg += imgW + gap;
        }
        y = imgY + imgH + 6;
      }

      // Separateur fin
      doc.moveTo(50, y).lineTo(50 + pageWidth, y)
        .strokeColor(COLORS.lightGray).lineWidth(0.5).stroke();
      y += 6;
    }

    // --- Financial summary ---
    y += 15;
    const summaryX = 320;
    const summaryW = pageWidth - 270;
    const summaryLines: [string, string][] = [
      ['Total transport', formatCurrency(invoiceData.totalAmount)],
      ...(invoiceData.storageFeesTotal && invoiceData.storageFeesTotal > 0
        ? [['Frais magasinage', formatCurrency(invoiceData.storageFeesTotal)] as [string, string]]
        : []),
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

    // --- Frais de magasinage : detail par charge (1 ligne = 1 magasin/phase) ---
    type FlatLine = InvoiceStorageLine & { tracking: string };
    const allLines: FlatLine[] = [];
    for (const p of parcels) {
      for (const l of (p.storageLines ?? [])) {
        if (l.phase === 'TRANSIT') continue; // transit jamais facture
        allLines.push({ ...l, tracking: p.trackingNumber });
      }
    }
    if (allLines.length > 0) {
      y += 20;
      if (y > 640) { doc.addPage(); y = 50; }
      doc.fontSize(11).fillColor(COLORS.primary).text(
        `Frais de magasinage detailles (${formatCurrency(invoiceData.storageFeesTotal ?? 0)})`,
        50, y,
      );
      y += 18;
      doc.fontSize(7.5).fillColor(COLORS.gray).text(
        '1 ligne = 1 sejour dans un magasin. La phase indique si le colis etait au depart, en transit ou a destination.',
        50, y, { width: pageWidth },
      );
      y += 14;

      // Largeurs ajustees pour tenir dans pageWidth (~495pt A4 portrait).
      const stCols = [
        { label: 'Tracking', width: 70 },
        { label: 'Magasin', width: 100 },
        { label: 'Phase', width: 55 },
        { label: 'Periode', width: 110 },
        { label: 'Jours', width: 45 },
        { label: 'Tarif/j', width: 55 },
        { label: 'Frais', width: 60 },
      ];
      doc.rect(50, y, pageWidth, 20).fill(COLORS.primary);
      let xCol2 = 55;
      doc.fontSize(8).fillColor(COLORS.white);
      for (const col of stCols) {
        doc.text(col.label, xCol2, y + 5, { width: col.width });
        xCol2 += col.width;
      }
      y += 20;

      doc.fillColor(COLORS.dark).fontSize(7.5);
      allLines.forEach((l, i) => {
        if (y > 750) { doc.addPage(); y = 50; }
        const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
        doc.rect(50, y, pageWidth, 22).fill(bg);
        doc.fillColor(COLORS.dark);
        xCol2 = 55;
        const wh = [l.warehouseName ?? '-', l.warehouseCity].filter(Boolean).join(' (') + (l.warehouseCity ? ')' : '');
        const phaseLabel = l.phase === 'DEPARTURE' ? 'Depart' : l.phase === 'DESTINATION' ? 'Destination' : 'Transit';
        const periode = `${formatDate(l.startedAt)} → ${l.isActive ? 'en cours' : formatDate(l.endedAt)}`;
        const row = [
          l.tracking,
          wh,
          phaseLabel,
          periode,
          `${l.chargedDays} (${l.freeDays} gratuit)`,
          formatCurrency(l.dailyRate),
          formatCurrency(l.feeAmount),
        ];
        for (let c = 0; c < stCols.length; c++) {
          doc.text(row[c], xCol2, y + 5, { width: stCols[c].width, ellipsis: true });
          xCol2 += stCols[c].width;
        }
        y += 22;
      });
    }

    // --- Historique des remises ---
    if (invoiceData.discountHistory && invoiceData.discountHistory.length > 0) {
      y += 15;
      if (y > 660) { doc.addPage(); y = 50; }
      doc.fontSize(11).fillColor(COLORS.primary).text(
        `Historique des remises (${invoiceData.discountHistory.length})`,
        50, y,
      );
      y += 20;

      const dCols = [
        { label: 'Date', width: 90 },
        { label: 'Action', width: 70 },
        { label: 'Avant', width: 70 },
        { label: 'Apres', width: 70 },
        { label: 'Raison', width: 150 },
        { label: 'Par', width: 60 },
      ];
      doc.rect(50, y, pageWidth, 20).fill(COLORS.primary);
      let xCol3 = 55;
      doc.fontSize(8).fillColor(COLORS.white);
      for (const col of dCols) {
        doc.text(col.label, xCol3, y + 5, { width: col.width });
        xCol3 += col.width;
      }
      y += 20;

      doc.fillColor(COLORS.dark).fontSize(8);
      invoiceData.discountHistory.forEach((entry, i) => {
        if (y > 750) { doc.addPage(); y = 50; }
        const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
        // Hauteur dynamique : si raison longue, on reserve plus pour wrap.
        const rowH = 22;
        doc.rect(50, y, pageWidth, rowH).fill(bg);
        doc.fillColor(COLORS.dark);
        xCol3 = 55;
        const row = [
          formatDate(entry.createdAt),
          entry.action === 'DISCOUNT_APPLIED' ? 'Appliquee' : 'Retiree',
          formatCurrency(Number(entry.previousDiscount ?? 0)),
          formatCurrency(Number(entry.newDiscount ?? 0)),
          entry.reason || '-',
          entry.userName || '-',
        ];
        for (let c = 0; c < dCols.length; c++) {
          doc.text(row[c], xCol3, y + 5, { width: dCols[c].width, ellipsis: true });
          xCol3 += dCols[c].width;
        }
        y += rowH;
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
    // Paysage : la table de bordereau a beaucoup de colonnes (#, tracking,
    // designation, client, destinataire, ville, route, P/V, a payer, avance).
    // En portrait elle deborde / les colonnes sont trop serrees. En paysage
    // (A4 = 842 x 595 pts) on a ~742pt utiles ce qui suffit largement.
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 50 });
    const pageWidth = doc.page.width - 100;
    // Seuil bas dynamique (laisse 70pt pour le footer). En paysage A4 ~525.
    // Auparavant les seuils etaient codes en dur (720/680/700) pour le
    // portrait, ce qui ne declenchait jamais addPage en paysage et laissait
    // pdfkit casser le bordereau en pages quasi-vides quand le contenu
    // depassait 595pt.
    const BOTTOM = doc.page.height - 70;
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
      // Colonnes Client / Destinataire elargies pour accueillir le nom ligne 1
      // + telephone ligne 2 + email ligne 3 (si present). Hauteur de ligne
      // augmentee en consequence.
      const cols = [
        { label: '#', width: 18 },
        { label: 'Tracking', width: 65 },
        { label: 'Designation', width: 55 },
        { label: 'Client', width: 85 },
        { label: 'Destinataire', width: 85 },
        { label: 'Ville', width: 45 },
        { label: 'Route', width: 55 },
        { label: 'P/V', width: 40 },
        { label: 'A payer', width: 50 },
        { label: 'Avance', width: 45 },
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
        // Hauteur dynamique : 1 ligne nom, +1 si phone, +1 si email (max 3).
        const clientLines = 1 + (p.clientPhone ? 1 : 0) + (p.clientEmail ? 1 : 0);
        const recipientLines = 1 + (p.recipientPhone ? 1 : 0) + (p.recipientEmail ? 1 : 0);
        const lines = Math.max(clientLines, recipientLines, 1);
        const rowH = Math.max(22, 8 + lines * 9);
        if (y + rowH > BOTTOM) {
          doc.addPage();
          y = 50;
          // Re-draw entete de table sur la nouvelle page.
          doc.rect(50, y, tableWidth, 22).fill(COLORS.primary);
          let hx = 55;
          doc.fontSize(7).fillColor(COLORS.white);
          for (const col of cols) {
            doc.text(col.label, hx, y + 7, { width: col.width - 2 });
            hx += col.width;
          }
          y += 22;
          doc.fillColor(COLORS.dark).fontSize(7);
        }
        const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
        doc.rect(50, y, tableWidth, rowH).fill(bg);
        doc.fillColor(COLORS.dark);
        xCol = 55;

        const pv = p.weight != null
          ? `${Number(p.weight)} kg`
          : p.volume != null
            ? `${Number(p.volume)} m3`
            : '-';

        // Pour la cellule client/destinataire on rend les lignes manuellement
        // pour controler le rendu (sinon PDFKit retourne a la ligne sur l'espace
        // entre le nom et le numero).
        const clientCellLines: string[] = [
          p.clientName || '-',
          ...(p.clientPhone ? [p.clientPhone] : []),
          ...(p.clientEmail ? [p.clientEmail] : []),
        ];
        const recipientCellLines: string[] = [
          p.recipientName || '-',
          ...(p.recipientPhone ? [p.recipientPhone] : []),
          ...(p.recipientEmail ? [p.recipientEmail] : []),
        ];

        const simpleRow: Array<string | string[]> = [
          String(i + 1),
          p.trackingNumber || '-',
          p.designation || '-',
          clientCellLines,
          recipientCellLines,
          p.destinationCity || p.destination || '-',
          // Route propre au colis ; fallback sur la route globale du
          // conteneur affichee dans l'en-tete si non renseignee.
          p.transit || manifestData.transitRoute || '-',
          pv,
          formatCurrency(Number(p.price) || 0),
          formatCurrency(Number(p.advanceAmount) || 0),
        ];
        for (let c = 0; c < cols.length; c++) {
          const cell = simpleRow[c];
          const w = cols[c].width - 2;
          if (Array.isArray(cell)) {
            // Ligne 1 : nom (gras) ; lignes suivantes : phone/email en gris.
            cell.forEach((line, idx) => {
              if (idx === 0) {
                doc.fillColor(COLORS.dark).font('Helvetica-Bold');
              } else {
                doc.fillColor(COLORS.gray).font('Helvetica');
              }
              doc.text(line, xCol, y + 5 + idx * 9, { width: w, lineBreak: false, ellipsis: true });
            });
            doc.font('Helvetica').fillColor(COLORS.dark);
          } else {
            doc.text(cell, xCol, y + 6, { width: w, lineBreak: false, ellipsis: true });
          }
          xCol += cols[c].width;
        }
        y += rowH;
      });
    }

    // --- Summary ---
    // Bloc resume (~95pt) + signatures (~125pt) doivent rentrer ensemble.
    // Si l'espace restant est insuffisant on passe a une nouvelle page.
    y += 15;
    if (y + 95 + 125 > BOTTOM) { doc.addPage(); y = 50; }
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
    if (y + 40 > BOTTOM) { doc.addPage(); y = 50; }

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
      // Tracking fournisseur externe (AliExpress, DHL, etc.) -- optionnel.
      trackingFournisseur?: string | null;
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
      // Position dans le groupe : index (1-based) et taille totale du groupe.
      // Si fournis, un badge "X/N" s'affiche dans l'en-tete (ex: "2/3").
      groupIndex?: number | null;
      groupSize?: number | null;
      groupReference?: string | null;
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

    // Badge "X/N" pour un colis appartenant a un groupe : carre blanc en haut
    // a droite du header pour rester visible meme si l'etiquette est partiellement
    // collee (lisible de loin sur le quai d'expedition).
    if (parcel.groupIndex && parcel.groupSize && parcel.groupSize > 1) {
      const badgeW = 38;
      const badgeH = 22;
      const badgeX = 15 + w - badgeW - 4;
      const badgeY = topOffset + 3;
      doc.rect(badgeX, badgeY, badgeW, badgeH).fill(COLORS.white);
      doc.rect(badgeX, badgeY, badgeW, badgeH).strokeColor(COLORS.primary).lineWidth(1).stroke();
      doc.fontSize(11).fillColor(COLORS.primary).text(
        `${parcel.groupIndex}/${parcel.groupSize}`,
        badgeX, badgeY + 5, { width: badgeW, align: 'center' },
      );
    }

    // QR code (decale si bandeaux)
    const qrY = topOffset + 32;
    doc.image(qrBuffer, 92, qrY, { width: 100 });

    // Reference du groupe (sous le QR, petit) si applicable.
    if (parcel.groupReference && parcel.groupSize && parcel.groupSize > 1) {
      doc.fontSize(7).fillColor(COLORS.gray).text(
        `Groupe : ${parcel.groupReference}`,
        15, topOffset + 132, { width: w, align: 'center' },
      );
    }

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
      ...(parcel.trackingFournisseur
        ? ([['Tracking fourn.', parcel.trackingFournisseur]] as [string, string][])
        : []),
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

  // -------------------------------------------------------------------------
  // Bulletin de paie (Payslip)
  // -------------------------------------------------------------------------

  static async generatePayslipPDF(data: PayslipPDFData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const pageWidth = doc.page.width - 100;

    // Header
    doc.rect(50, 40, pageWidth, 70).fill(COLORS.primary);
    doc.fontSize(22).fillColor(COLORS.white).text('BULLETIN DE PAIE', 60, 55, {
      width: pageWidth - 20,
      align: 'center',
    });
    doc.fontSize(11).fillColor(COLORS.white).text(`Periode : ${data.period}`, 60, 85, {
      width: pageWidth - 20,
      align: 'center',
    });

    let y = 130;

    // Agency block (left) / Employee block (right)
    doc.fontSize(9).fillColor(COLORS.gray).text('Employeur', 50, y);
    doc.text('Employe', 320, y, { width: pageWidth - 270 });
    y += 14;
    doc.fontSize(10).fillColor(COLORS.dark).text(data.agency?.name ?? '-', 50, y);
    doc.text(data.employee.fullName, 320, y, { width: pageWidth - 270 });
    y += 14;
    if (data.agency?.address) { doc.fontSize(9).text(data.agency.address, 50, y); }
    if (data.employee.position) {
      doc.fontSize(9).text(`Poste : ${data.employee.position}`, 320, y, { width: pageWidth - 270 });
    }
    y += 14;
    if (data.agency?.phone) { doc.fontSize(9).text(`Tel: ${data.agency.phone}`, 50, y); }
    if (data.employee.idNumber) {
      doc.fontSize(9).text(`Matricule : ${data.employee.idNumber}`, 320, y, { width: pageWidth - 270 });
    }
    y += 14;
    if (data.employee.contractType) {
      doc.fontSize(9).text(`Contrat : ${data.employee.contractType}`, 320, y, { width: pageWidth - 270 });
    }

    // Salary breakdown table
    y = Math.max(y, 220);
    doc.rect(50, y, pageWidth, 22).fill(COLORS.primary);
    doc.fontSize(10).fillColor(COLORS.white).text('Designation', 60, y + 6);
    doc.text('Montant', 60, y + 6, { width: pageWidth - 20, align: 'right' });
    y += 22;

    const rows: Array<[string, number, 'add' | 'sub' | 'neutral']> = [
      ['Salaire de base', Number(data.baseSalary), 'add'],
    ];
    if (Number(data.bonuses ?? 0) > 0) rows.push(['Primes', Number(data.bonuses), 'add']);
    if (Number(data.benefitsInKind ?? 0) > 0) rows.push(['Avantages en nature', Number(data.benefitsInKind), 'add']);
    rows.push(['Salaire brut', Number(data.grossSalary), 'neutral']);
    if (Number(data.socialContributions ?? 0) > 0) rows.push(['Cotisations sociales', -Number(data.socialContributions), 'sub']);
    if (Number(data.deductionsTotal ?? 0) > 0) rows.push(['Retenues sur salaire', -Number(data.deductionsTotal), 'sub']);
    rows.push(['Salaire net', Number(data.netSalary), 'neutral']);

    doc.fontSize(10);
    rows.forEach(([label, amount, kind], i) => {
      const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
      doc.rect(50, y, pageWidth, 22).fill(bg);
      const color = kind === 'sub' ? '#B91C1C' : kind === 'add' ? COLORS.dark : COLORS.primary;
      const fontEmphasis = kind === 'neutral' ? 'Helvetica-Bold' : 'Helvetica';
      doc.fillColor(color).font(fontEmphasis).text(label, 60, y + 6, { width: pageWidth / 2 });
      doc.text(formatCurrency(amount), 60, y + 6, { width: pageWidth - 20, align: 'right' });
      y += 22;
    });
    doc.font('Helvetica').fillColor(COLORS.dark);

    // Payments history (installments)
    y += 15;
    if (y > 650) { doc.addPage(); y = 50; }
    doc.fontSize(11).fillColor(COLORS.primary).text('Historique des versements', 50, y);
    y += 18;

    if (!data.payments || data.payments.length === 0) {
      doc.fontSize(9).fillColor(COLORS.gray).text('Aucun versement enregistre.', 50, y);
      y += 16;
    } else {
      const cols = [
        { label: 'Date', width: 100 },
        { label: 'Montant', width: 120 },
        { label: 'Note', width: pageWidth - 220 },
      ];
      doc.rect(50, y, pageWidth, 20).fill(COLORS.primary);
      let xCol = 55;
      doc.fontSize(9).fillColor(COLORS.white);
      for (const col of cols) {
        doc.text(col.label, xCol, y + 6, { width: col.width });
        xCol += col.width;
      }
      y += 20;
      doc.fillColor(COLORS.dark).fontSize(9);
      data.payments.forEach((p, i) => {
        if (y > 720) { doc.addPage(); y = 50; }
        const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
        doc.rect(50, y, pageWidth, 18).fill(bg);
        doc.fillColor(COLORS.dark);
        doc.text(formatDate(p.paidAt), 55, y + 5, { width: cols[0].width });
        doc.text(formatCurrency(Number(p.amount)), 55 + cols[0].width, y + 5, { width: cols[1].width });
        doc.text(p.note || '-', 55 + cols[0].width + cols[1].width, y + 5, { width: cols[2].width });
        y += 18;
      });
    }

    // Totals
    y += 10;
    if (y > 700) { doc.addPage(); y = 50; }
    const paidTotal = (data.payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.max(0, Number(data.netSalary) - paidTotal);

    doc.rect(50, y, pageWidth, 60).fill(COLORS.lightGray);
    doc.fontSize(10).fillColor(COLORS.dark);
    doc.text(`Total verse : ${formatCurrency(paidTotal)}`, 60, y + 10);
    doc.text(`Reste a payer : ${formatCurrency(remaining)}`, 60, y + 28);
    doc
      .fontSize(12)
      .fillColor(remaining === 0 ? COLORS.primary : '#B91C1C')
      .text(remaining === 0 ? 'SOLDE' : 'EN COURS', 60, y + 10, {
        width: pageWidth - 20,
        align: 'right',
      });

    y += 90;
    if (y > 720) { doc.addPage(); y = 50; }

    // Signatures
    doc.fontSize(10).fillColor(COLORS.dark);
    doc.text('Employeur :', 60, y);
    doc.text('Employe :', 330, y);
    y += 40;
    doc.moveTo(60, y).lineTo(220, y).strokeColor(COLORS.dark).stroke();
    doc.moveTo(330, y).lineTo(490, y).strokeColor(COLORS.dark).stroke();

    drawFooter(doc, pageWidth);
    return collectBuffer(doc);
  }
}

export interface PayslipPDFData {
  period: string;
  generatedAt: Date | string;
  agency?: { name: string; address?: string | null; phone?: string | null } | null;
  employee: {
    fullName: string;
    position?: string | null;
    idNumber?: string | null;
    contractType?: string | null;
  };
  baseSalary: number;
  bonuses?: number;
  benefitsInKind?: number;
  socialContributions?: number;
  grossSalary: number;
  netSalary: number;
  deductionsTotal?: number;
  paymentNote?: string | null;
  payments?: Array<{ amount: number | string; paidAt: Date | string; note?: string | null }>;
}
