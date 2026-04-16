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
  weight: number;
  destination: string;
  price: number;
}

export interface ManifestData {
  title?: string; // "BORDEREAU D'ENVOI" or "BORDEREAU DE RECEPTION"
  containerDesignation: string;
  containerType: string;
  departureAgency: string;
  arrivalAgency: string;
  date: Date | string;
  parcels: ManifestParcel[];
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
      .text('OPTIPACK', 60, 52, { continued: true })
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
      .text('OptiPack - Transit & Logistique', 50, footerY + 8, {
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
      .fontSize(20)
      .fillColor(COLORS.white)
      .text(title, 60, 55, { width: pageWidth - 20, align: 'center' });

    // --- Container info ---
    let y = 120;
    doc.fillColor(COLORS.dark).fontSize(10);
    doc.text(`Date: ${formatDate(manifestData.date)}`, 50, y);
    y += 20;
    doc.text(`Conteneur: ${manifestData.containerDesignation}`, 50, y);
    doc.text(`Type: ${manifestData.containerType}`, 300, y, { width: pageWidth - 250 });
    y += 18;
    doc.text(`Agence depart: ${manifestData.departureAgency}`, 50, y);
    doc.text(`Agence arrivee: ${manifestData.arrivalAgency}`, 300, y, { width: pageWidth - 250 });

    // --- Parcels table ---
    y += 35;
    const cols = [
      { label: '#', width: 25 },
      { label: 'Tracking', width: 110 },
      { label: 'Designation', width: 140 },
      { label: 'Poids (kg)', width: 70 },
      { label: 'Destination', width: 100 },
      { label: 'Prix', width: 80 },
    ];

    doc.rect(50, y, pageWidth, 22).fill(COLORS.primary);
    let xCol = 55;
    doc.fontSize(8).fillColor(COLORS.white);
    for (const col of cols) {
      doc.text(col.label, xCol, y + 6, { width: col.width });
      xCol += col.width;
    }
    y += 22;

    doc.fillColor(COLORS.dark).fontSize(8);
    manifestData.parcels.forEach((p, i) => {
      if (y > 700) { doc.addPage(); y = 50; }
      const bg = i % 2 === 0 ? COLORS.white : COLORS.lightGray;
      doc.rect(50, y, pageWidth, 20).fill(bg);
      doc.fillColor(COLORS.dark);
      xCol = 55;
      const row = [
        String(i + 1),
        p.trackingNumber,
        p.designation || '-',
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

    // --- Summary ---
    y += 20;
    const totalParcels = manifestData.parcels.length;
    const totalWeight = manifestData.parcels.reduce((s, p) => s + (Number(p.weight) || 0), 0);
    const totalValue = manifestData.parcels.reduce((s, p) => s + (Number(p.price) || 0), 0);

    doc.rect(50, y, pageWidth, 60).fill(COLORS.lightGray);
    doc.fontSize(10).fillColor(COLORS.dark);
    doc.text(`Total colis: ${totalParcels}`, 60, y + 10);
    doc.text(`Poids total: ${totalWeight} kg`, 60, y + 28);
    doc.text(`Valeur totale: ${formatCurrency(totalValue)}`, 60, y + 46);

    // --- Signatures ---
    y += 90;
    if (y > 720) { doc.addPage(); y = 50; }

    doc.fontSize(10).fillColor(COLORS.dark);
    doc.text('Expediteur:', 60, y);
    doc.text('Recepteur:', 330, y);
    y += 40;
    doc
      .moveTo(60, y)
      .lineTo(220, y)
      .stroke();
    doc
      .moveTo(330, y)
      .lineTo(490, y)
      .stroke();

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
      .text('OptiPack - Transit & Logistique', 50, footerY + 8, {
        align: 'center',
        width: pageWidth,
      });

    return collectBuffer(doc);
  }

  // -------------------------------------------------------------------------
  // Parcel Label PDF (QR + info)
  // -------------------------------------------------------------------------

  static async generateLabelPDF(
    parcel: { trackingNumber: string; designation: string; weight: number; destination: string; clientName: string },
    qrBuffer: Buffer,
  ): Promise<Buffer> {
    const doc = new PDFDocument({ size: [283, 425], margin: 15 }); // ~100x150mm label
    const w = 283 - 30;

    // Header
    doc.rect(15, 10, w, 30).fill(COLORS.primary);
    doc.fontSize(14).fillColor(COLORS.white).text('OPTIPACK', 20, 16, { width: w - 10, align: 'center' });

    // QR code
    doc.image(qrBuffer, 67, 50, { width: 150 });

    // Tracking number
    doc.fontSize(12).fillColor(COLORS.dark).text(parcel.trackingNumber, 15, 210, { width: w, align: 'center' });

    // Info lines
    let y = 235;
    const lines: [string, string][] = [
      ['Designation', parcel.designation],
      ['Poids', `${parcel.weight} kg`],
      ['Destination', parcel.destination],
      ['Client', parcel.clientName],
    ];

    doc.fontSize(8);
    for (const [label, value] of lines) {
      doc.fillColor(COLORS.gray).text(label + ':', 20, y);
      doc.fillColor(COLORS.dark).text(value, 90, y, { width: w - 80 });
      y += 16;
    }

    // Footer line
    doc
      .moveTo(15, 395)
      .lineTo(15 + w, 395)
      .strokeColor(COLORS.primary)
      .lineWidth(0.5)
      .stroke();
    doc.fontSize(6).fillColor(COLORS.gray).text('OptiPack - Transit & Logistique', 15, 400, { width: w, align: 'center' });

    return collectBuffer(doc);
  }
}
