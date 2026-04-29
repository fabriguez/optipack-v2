import { injectable } from 'tsyringe';
import nodemailer, { type Transporter } from 'nodemailer';
import { config } from '../../config';
import { logger } from '../logger';

/**
 * Phase 5 — notifications transactionnelles ops + tenant.
 *
 * - Email (SMTP via nodemailer) pour les owners de tenants et les ops admins
 * - Webhook (Discord/Slack) pour les alertes critiques cote ops
 *
 * No-op silencieux si SMTP/webhook non configures (dev).
 */
@injectable()
export class NotificationService {
  private transporter: Transporter | null = null;

  private getTransporter(): Transporter | null {
    if (!config.smtp.user || !config.smtp.pass || !config.smtp.host) return null;
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: { user: config.smtp.user, pass: config.smtp.pass },
      });
    }
    return this.transporter;
  }

  async email(to: string, subject: string, html: string): Promise<boolean> {
    const tx = this.getTransporter();
    if (!tx) {
      logger.debug({ to, subject }, '[notif] SMTP non configure, email skip');
      return false;
    }
    try {
      await tx.sendMail({ from: config.smtp.from, to, subject, html });
      logger.info({ to, subject }, '[notif] email envoye');
      return true;
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err), to, subject },
        '[notif] email failed',
      );
      return false;
    }
  }

  /** Discord/Slack-compatible webhook (texte simple). */
  async alert(message: string, details?: Record<string, unknown>): Promise<void> {
    if (!config.alertWebhookUrl) {
      logger.debug({ message }, '[notif] webhook non configure, alert skip');
      return;
    }
    const payload = JSON.stringify({
      content: details ? `${message}\n\`\`\`json\n${JSON.stringify(details, null, 2)}\n\`\`\`` : message,
    });
    try {
      const res = await fetch(config.alertWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      });
      if (!res.ok) {
        logger.warn({ status: res.status }, '[notif] webhook non-ok');
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        '[notif] webhook failed',
      );
    }
  }

  // ============================================================
  // Templates
  // ============================================================

  async tenantProvisioned(to: string, slug: string, ownerLink: string): Promise<void> {
    const subject = `Votre instance OptiPack ${slug} est prete`;
    const html = `
      <h2>Bienvenue sur OptiPack</h2>
      <p>Votre instance <strong>${slug}</strong> a ete provisionnee avec succes.</p>
      <p>Connectez-vous ici : <a href="${ownerLink}">${ownerLink}</a></p>
      <p>Vous recevrez un email separe avec votre mot de passe initial.</p>
    `;
    await this.email(to, subject, html);
  }

  async updateAvailable(to: string, slug: string, version: string, link: string): Promise<void> {
    const subject = `Mise a jour ${version} disponible pour ${slug}`;
    const html = `
      <h2>Nouvelle version OptiPack</h2>
      <p>La version <strong>${version}</strong> est disponible pour votre instance <strong>${slug}</strong>.</p>
      <p>Voir le changelog et appliquer : <a href="${link}">${link}</a></p>
    `;
    await this.email(to, subject, html);
  }

  async updateResult(
    to: string,
    slug: string,
    version: string,
    success: boolean,
    err?: string,
  ): Promise<void> {
    const subject = success
      ? `Mise a jour ${version} appliquee sur ${slug}`
      : `Echec mise a jour ${version} sur ${slug}`;
    const html = success
      ? `<p>Votre instance <strong>${slug}</strong> est maintenant en version ${version}.</p>
         <p>Vous disposez de 30 minutes pour rollback si besoin.</p>`
      : `<p>La mise a jour a echoue : <code>${err ?? 'erreur inconnue'}</code>.</p>
         <p>Votre instance a ete restauree a la version precedente.</p>`;
    await this.email(to, subject, html);
  }

  async subscriptionExpiring(to: string, slug: string, daysLeft: number, payLink: string): Promise<void> {
    const subject = `Votre abonnement expire dans ${daysLeft} jours`;
    const html = `
      <h2>Renouvellement requis</h2>
      <p>L'abonnement de <strong>${slug}</strong> expire dans ${daysLeft} jours.</p>
      <p>Renouveler ici : <a href="${payLink}">${payLink}</a></p>
      <p>Sans renouvellement, votre instance sera mise en pause (frozen).</p>
    `;
    await this.email(to, subject, html);
  }

  async tenantFrozen(to: string, slug: string, payLink: string): Promise<void> {
    const subject = `${slug} en pause - paiement requis`;
    const html = `
      <p>L'abonnement de <strong>${slug}</strong> a expire et l'instance a ete mise en pause.</p>
      <p>Reactiver immediatement en payant : <a href="${payLink}">${payLink}</a></p>
    `;
    await this.email(to, subject, html);
  }

  async vpsDown(host: string, lastSeenAt: Date | null): Promise<void> {
    await this.alert(`VPS ${host} offline > 15 min`, {
      host,
      lastSeenAt: lastSeenAt?.toISOString() ?? 'never',
    });
  }

  async provisioningFailed(slug: string, vpsHost: string, error: string): Promise<void> {
    await this.alert(`Provisioning ${slug} sur ${vpsHost} a echoue`, { slug, vpsHost, error });
  }
}
