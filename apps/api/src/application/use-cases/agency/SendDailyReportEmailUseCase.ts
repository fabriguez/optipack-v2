import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { DailyReportPDFService } from '../../services/DailyReportPDFService';
import { ManifestPDFBuilder } from '../../services/ManifestPDFBuilder';
import { StorageService } from '../../../infrastructure/storage/StorageService';
import { tenantEmailDispatcher } from '../../../infrastructure/email/TenantEmailDispatcher';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('SendDailyReportEmail');

interface Recipient {
  email: string;
  name: string;
  role: 'CHEF_AGENCE' | 'ADMIN' | 'SUPER_ADMIN' | 'CASHIER_CLOSER' | 'CUSTOM';
}

interface SendOptions {
  /**
   * Liste d'emails saisie manuellement par l'utilisateur. Si fournie (non
   * vide), elle remplace la resolution automatique des destinataires.
   */
  recipients?: string[];
}

/**
 * Envoie le rapport journalier d'une agence par mail :
 *  - chef d'agence (CHEF_AGENCE assigne a l'agence)
 *  - admins de l'organisation (ADMIN, SUPER_ADMIN)
 *  - caissier ayant ferme la caisse (closedBy)
 *
 * Format : PDF en piece jointe + resume HTML chiffres dans le corps.
 * Idempotent : peut etre rappele pour renvoyer (met a jour emailedAt +
 * audit destinataires dans emailSentTo).
 */
@injectable()
export class SendDailyReportEmailUseCase {
  constructor(
    @inject(DailyReportPDFService) private pdfService: DailyReportPDFService,
    @inject(StorageService) private storage: StorageService,
    @inject(ManifestPDFBuilder) private manifestBuilder: ManifestPDFBuilder,
  ) {}

  async execute(reportId: string, options?: SendOptions): Promise<{ sent: number; recipients: Recipient[] }> {
    const report = await prisma.agencyDailyReport.findUnique({
      where: { id: reportId },
      include: {
        attachments: { orderBy: { createdAt: 'asc' } },
        closedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        agency: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            userAgencies: {
              select: {
                user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
              },
            },
          },
        },
      },
    });
    if (!report) throw new NotFoundError('Rapport journalier', reportId);

    const payload = report.payload as any;
    const organizationId = report.agency.organizationId;

    // Destinataires : liste manuelle si fournie, sinon resolution automatique
    // (chef d'agence + admins + caissier ayant ferme la caisse), dedup email.
    const manual = (options?.recipients ?? [])
      .map((e) => e.trim())
      .filter((e) => e.length > 0);
    const recipients = manual.length > 0
      ? this.buildCustomRecipients(manual)
      : await this.resolveRecipients(report, organizationId);
    if (recipients.length === 0) {
      logger.warn({ reportId, agencyId: report.agencyId }, 'Aucun destinataire resolu pour le rapport');
      return { sent: 0, recipients: [] };
    }

    // Build PDF buffer (reutilise la logique du controller).
    const logoBuffer = await this.fetchLogo(payload?.organization?.logoUrl);
    const pdfBuffer = await this.pdfService.generate({
      reportDate: report.date,
      status: report.status,
      observation: report.observation,
      closedAt: report.closedAt,
      closedByName: report.closedByUser
        ? `${report.closedByUser.firstName} ${report.closedByUser.lastName}`
        : null,
      payload,
      attachments: report.attachments.map((a) => ({
        id: a.id,
        fileName: a.fileName,
        caption: a.caption,
        contentType: a.contentType,
        createdAt: a.createdAt.toISOString(),
      })),
      logoBuffer,
    });

    const dateStr = new Date(report.date).toISOString().slice(0, 10);
    const filename = `rapport-${report.agency.name.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${dateStr}.pdf`;
    const subject = `Rapport journalier ${report.agency.name} - ${dateStr}`;
    const html = this.buildHtmlSummary(report, payload);

    // Bordereaux des conteneurs lies au rapport :
    //  - sent containers : bordereau DISPATCH (envoi)
    //  - received containers : bordereau RECEPTION + comparaison si hasComparison
    const manifestAttachments = await this.buildManifestAttachments(payload);

    // Pieces jointes uploadees sur le rapport (recus, justificatifs...) :
    // jointes telles quelles au mail en plus du PDF de synthese.
    const uploadedAttachments = await this.buildUploadedAttachments(
      report.attachments.map((a) => ({
        storageKey: a.storageKey,
        url: a.url,
        fileName: a.fileName,
        contentType: a.contentType,
      })),
    );

    const allAttachments = [
      { filename, content: pdfBuffer, contentType: 'application/pdf' },
      ...manifestAttachments,
      ...uploadedAttachments,
    ];

    let sent = 0;
    const sentAudit: Array<Recipient & { sentAt: string; ok: boolean; error?: string }> = [];
    for (const r of recipients) {
      const result = await tenantEmailDispatcher.sendForTenant(
        organizationId,
        {
          to: r.email,
          subject,
          html,
          attachments: allAttachments,
          tag: 'daily-report',
        },
        { event: 'DAILY_REPORT_SENT' },
      );
      if (result.ok) sent += 1;
      sentAudit.push({ ...r, sentAt: new Date().toISOString(), ok: result.ok, error: result.error });
    }

    await prisma.agencyDailyReport.update({
      where: { id: report.id },
      data: { emailedAt: new Date(), emailSentTo: sentAudit as any },
    });

    return { sent, recipients };
  }

  /** Construit des destinataires a partir d'une liste d'emails saisie (dedup, email valide). */
  private buildCustomRecipients(emails: string[]): Recipient[] {
    const map = new Map<string, Recipient>();
    for (const raw of emails) {
      const email = raw.trim();
      // Validation legere : format email basique. On ignore les entrees invalides.
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
      const key = email.toLowerCase();
      if (!map.has(key)) map.set(key, { email, name: email, role: 'CUSTOM' });
    }
    return Array.from(map.values());
  }

  /** Recupere le contenu binaire des pieces jointes uploadees pour les joindre au mail. */
  private async buildUploadedAttachments(
    attachments: Array<{ storageKey: string | null; url: string; fileName: string | null; contentType: string | null }>,
  ): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
    const out: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    for (const [i, a] of attachments.entries()) {
      const filename = a.fileName || `piece-jointe-${i + 1}`;
      try {
        if (a.storageKey) {
          const obj = await this.storage.getObject(a.storageKey);
          if (!obj) {
            logger.warn({ storageKey: a.storageKey }, 'Piece jointe introuvable dans le storage');
            continue;
          }
          const content = await this.streamToBuffer(obj.stream);
          out.push({ filename, content, contentType: a.contentType || obj.contentType });
        } else if (a.url) {
          // Piece jointe externe (pas de cle storage) : recuperation HTTP.
          const res = await fetch(a.url);
          if (!res.ok) continue;
          const content = Buffer.from(await res.arrayBuffer());
          out.push({ filename, content, contentType: a.contentType || res.headers.get('content-type') || 'application/octet-stream' });
        }
      } catch (err) {
        logger.warn({ err, storageKey: a.storageKey, url: a.url }, 'Echec recuperation piece jointe pour le mail');
      }
    }
    return out;
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  private async resolveRecipients(
    report: {
      closedByUser: { id: string; firstName: string; lastName: string; email: string } | null;
      agency: {
        organizationId: string;
        userAgencies: Array<{ user: { id: string; firstName: string; lastName: string; email: string; role: string } }>;
      };
    },
    organizationId: string,
  ): Promise<Recipient[]> {
    const map = new Map<string, Recipient>();

    // 1. Chefs d'agence (UserAgency où user.role = CHEF_AGENCE)
    for (const ua of report.agency.userAgencies) {
      if (ua.user.role === 'CHEF_AGENCE' && ua.user.email) {
        const key = ua.user.email.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            email: ua.user.email,
            name: `${ua.user.firstName} ${ua.user.lastName}`,
            role: 'CHEF_AGENCE',
          });
        }
      }
    }

    // 2. Admins de l'organisation (ADMIN, SUPER_ADMIN)
    const admins = await prisma.user.findMany({
      where: {
        organizationId,
        role: { in: ['ADMIN', 'SUPER_ADMIN'] },
        isActive: true,
      },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
    });
    for (const a of admins) {
      if (!a.email) continue;
      const key = a.email.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          email: a.email,
          name: `${a.firstName} ${a.lastName}`,
          role: a.role as 'ADMIN' | 'SUPER_ADMIN',
        });
      }
    }

    // 3. Caissier ayant ferme la caisse
    if (report.closedByUser?.email) {
      const key = report.closedByUser.email.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          email: report.closedByUser.email,
          name: `${report.closedByUser.firstName} ${report.closedByUser.lastName}`,
          role: 'CASHIER_CLOSER',
        });
      }
    }

    return Array.from(map.values());
  }

  private async buildManifestAttachments(
    payload: any,
  ): Promise<Array<{ filename: string; content: Buffer; contentType: string }>> {
    const out: Array<{ filename: string; content: Buffer; contentType: string }> = [];

    type C = { id: string; designation: string; manifests?: Array<{ id: string; type: 'DISPATCH' | 'RECEPTION' }>; hasComparison?: boolean };
    const sent: C[] = payload?.sentContainers ?? [];
    const received: C[] = payload?.receivedContainers ?? [];

    // Bordereaux d'envoi (containers sortants).
    for (const c of sent) {
      for (const m of c.manifests ?? []) {
        if (m.type !== 'DISPATCH') continue;
        try {
          const pdf = await this.manifestBuilder.buildManifestPDF(m.id);
          out.push({ filename: `envoi-${c.designation}-${pdf.filename}`, content: pdf.buffer, contentType: 'application/pdf' });
        } catch (err) {
          logger.warn({ err, manifestId: m.id, containerId: c.id }, 'Echec build bordereau envoi');
        }
      }
    }

    // Bordereaux de reception + comparaison (containers entrants).
    for (const c of received) {
      for (const m of c.manifests ?? []) {
        if (m.type !== 'RECEPTION') continue;
        try {
          const pdf = await this.manifestBuilder.buildManifestPDF(m.id);
          out.push({ filename: `reception-${c.designation}-${pdf.filename}`, content: pdf.buffer, contentType: 'application/pdf' });
        } catch (err) {
          logger.warn({ err, manifestId: m.id, containerId: c.id }, 'Echec build bordereau reception');
        }
      }
      if (c.hasComparison) {
        try {
          const pdf = await this.manifestBuilder.buildComparisonPDF(c.id);
          out.push({ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' });
        } catch (err) {
          logger.warn({ err, containerId: c.id }, 'Echec build bordereau comparaison');
        }
      }
    }

    return out;
  }

  private async fetchLogo(logoUrl: string | undefined): Promise<Buffer | null> {
    // fetchLogoBuffer gere toutes les formes de logoUrl (data URL, cle MinIO
    // publique/privee, URL externe) -- l'extraction manuelle ne couvrait que
    // /uploads/object/ et laissait le PDF sans logo sinon.
    const { fetchLogoBuffer } = await import('../../services/PdfBrandingService');
    return fetchLogoBuffer(logoUrl);
  }

  private escapeHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildHtmlSummary(report: { date: Date; agency: { name: string }; observation?: string | null }, payload: any): string {
    const dateStr = new Date(report.date).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
    const fmt = (n: number) =>
      `${Math.round(Number.isFinite(n) ? n : 0)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA`;

    const recette = Number(payload?.recetteTotal ?? 0);
    const avances = Number(payload?.advancesTotal ?? 0);
    const expenses = Number(payload?.expensesTotal ?? 0);
    const disbursements = Number(payload?.disbursementsTotal ?? 0);
    const soldeCaisse = Number(payload?.cashRegister?.closingBalance ?? payload?.cashRegister?.currentBalance ?? 0);
    const cr = payload?.cashRegister;
    const flowIn = payload?.flow?.in ?? {};
    const flowOut = payload?.flow?.out ?? {};
    const recv = (payload?.receivedContainers ?? []).length;
    const sent = (payload?.sentContainers ?? []).length;
    const soldeColor = soldeCaisse >= 0 ? '#16a34a' : '#dc2626';

    return `
<!doctype html>
<html lang="fr"><body style="font-family: -apple-system, system-ui, sans-serif; background:#f9fafb; padding:24px; color:#111827;">
  <div style="max-width:640px; margin:0 auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.06);">
    <div style="background:#1B5E20; color:#fff; padding:20px 24px;">
      <div style="font-size:12px; opacity:.85;">RAPPORT JOURNALIER D'ACTIVITE</div>
      <h1 style="margin:4px 0 0; font-size:20px;">${report.agency.name}</h1>
      <div style="margin-top:4px; font-size:13px; opacity:.9;">${dateStr}</div>
    </div>

    <div style="padding:20px 24px;">
      <h2 style="font-size:14px; margin:0 0 12px; color:#374151; text-transform:uppercase; letter-spacing:.5px;">Synthese financiere</h2>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:6px 0; color:#6b7280;">Recettes</td><td style="text-align:right; font-weight:600; color:#16a34a;">+${fmt(recette)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Paiements en avance</td><td style="text-align:right; font-weight:600;">+${fmt(avances)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Depenses</td><td style="text-align:right; font-weight:600; color:#dc2626;">-${fmt(expenses)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Decaissements</td><td style="text-align:right; font-weight:600; color:#dc2626;">-${fmt(disbursements)}</td></tr>
        <tr><td style="padding:10px 0 6px; border-top:1px solid #e5e7eb; font-weight:600;">Solde caisse agence</td><td style="text-align:right; padding-top:10px; border-top:1px solid #e5e7eb; font-weight:700; color:${soldeColor};">${fmt(soldeCaisse)}</td></tr>
      </table>

      <h2 style="font-size:14px; margin:24px 0 12px; color:#374151; text-transform:uppercase; letter-spacing:.5px;">Mouvements</h2>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:4px 0; color:#6b7280;">Colis entres</td><td style="text-align:right;">${flowIn.count ?? 0}</td></tr>
        <tr><td style="padding:4px 0; color:#6b7280;">Colis sortis</td><td style="text-align:right;">${flowOut.count ?? 0}</td></tr>
        <tr><td style="padding:4px 0; color:#6b7280;">Conteneurs recus</td><td style="text-align:right;">${recv}</td></tr>
        <tr><td style="padding:4px 0; color:#6b7280;">Conteneurs envoyes</td><td style="text-align:right;">${sent}</td></tr>
      </table>

      ${cr ? `
      <h2 style="font-size:14px; margin:24px 0 12px; color:#374151; text-transform:uppercase; letter-spacing:.5px;">Caisse</h2>
      <table style="width:100%; border-collapse:collapse; font-size:14px;">
        <tr><td style="padding:4px 0; color:#6b7280;">Ouverture</td><td style="text-align:right;">${fmt(cr.openingBalance ?? 0)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b7280;">Entrees</td><td style="text-align:right; color:#16a34a;">+${fmt(cr.totalEntries ?? 0)}</td></tr>
        <tr><td style="padding:4px 0; color:#6b7280;">Sorties</td><td style="text-align:right; color:#dc2626;">-${fmt(cr.totalExits ?? 0)}</td></tr>
        <tr><td style="padding:6px 0; color:#111827; font-weight:600;">Solde de cloture</td><td style="text-align:right; font-weight:700;">${fmt(cr.closingBalance ?? cr.currentBalance ?? 0)}</td></tr>
      </table>` : ''}

      ${report.observation && report.observation.trim() ? `
      <h2 style="font-size:14px; margin:24px 0 12px; color:#374151; text-transform:uppercase; letter-spacing:.5px;">Observation</h2>
      <p style="margin:0; font-size:14px; color:#374151; white-space:pre-wrap; background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:12px;">${this.escapeHtml(report.observation.trim())}</p>` : ''}

      <p style="margin:24px 0 0; font-size:13px; color:#6b7280;">
        Le rapport complet est joint en piece jointe (PDF), avec les pieces justificatives eventuelles.
      </p>
    </div>
  </div>
</body></html>`;
  }
}

export const SEND_DAILY_REPORT_EMAIL_USE_CASE = Symbol.for('SendDailyReportEmailUseCase');
