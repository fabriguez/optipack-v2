import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { NotFoundError } from '../../../domain/errors/BusinessError';
import { DailyReportPDFService } from '../../services/DailyReportPDFService';
import { StorageService } from '../../../infrastructure/storage/StorageService';
import { tenantEmailDispatcher } from '../../../infrastructure/email/TenantEmailDispatcher';
import { createChildLogger } from '../../../config/logger';

const logger = createChildLogger('SendDailyReportEmail');

interface Recipient {
  email: string;
  name: string;
  role: 'CHEF_AGENCE' | 'ADMIN' | 'SUPER_ADMIN' | 'CASHIER_CLOSER';
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
  ) {}

  async execute(reportId: string): Promise<{ sent: number; recipients: Recipient[] }> {
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

    // Resolution destinataires (dedup par email lowercase).
    const recipients = await this.resolveRecipients(report, organizationId);
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

    let sent = 0;
    const sentAudit: Array<Recipient & { sentAt: string; ok: boolean; error?: string }> = [];
    for (const r of recipients) {
      const result = await tenantEmailDispatcher.sendForTenant(
        organizationId,
        {
          to: r.email,
          subject,
          html,
          attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
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

  private async fetchLogo(logoUrl: string | undefined): Promise<Buffer | null> {
    if (!logoUrl) return null;
    try {
      const key = logoUrl.split('/uploads/object/').pop() ?? logoUrl;
      const obj = await this.storage.getObject(key);
      if (!obj) return null;
      const chunks: Buffer[] = [];
      for await (const ch of obj.stream as any) chunks.push(ch as Buffer);
      return Buffer.concat(chunks);
    } catch {
      return null;
    }
  }

  private buildHtmlSummary(report: { date: Date; agency: { name: string } }, payload: any): string {
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
    const profit = Number(payload?.profit ?? 0);
    const cr = payload?.cashRegister;
    const flowIn = payload?.flow?.in ?? {};
    const flowOut = payload?.flow?.out ?? {};
    const recv = (payload?.receivedContainers ?? []).length;
    const sent = (payload?.sentContainers ?? []).length;
    const profitColor = profit >= 0 ? '#16a34a' : '#dc2626';

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
        <tr><td style="padding:6px 0; color:#6b7280;">Avances</td><td style="text-align:right; font-weight:600;">+${fmt(avances)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Depenses</td><td style="text-align:right; font-weight:600; color:#dc2626;">-${fmt(expenses)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Decaissements</td><td style="text-align:right; font-weight:600; color:#dc2626;">-${fmt(disbursements)}</td></tr>
        <tr><td style="padding:10px 0 6px; border-top:1px solid #e5e7eb; font-weight:600;">Benefice estime</td><td style="text-align:right; padding-top:10px; border-top:1px solid #e5e7eb; font-weight:700; color:${profitColor};">${fmt(profit)}</td></tr>
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

      <p style="margin:24px 0 0; font-size:13px; color:#6b7280;">
        Le rapport complet est joint en piece jointe (PDF).
      </p>
    </div>
  </div>
</body></html>`;
  }
}

export const SEND_DAILY_REPORT_EMAIL_USE_CASE = Symbol.for('SendDailyReportEmailUseCase');
