import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../../config';
import type {
  EmailSendParams,
  EmailSendResult,
  TenantEmailProvider,
} from './types';

/**
 * Provider SMTP partage (nodemailer). Utilise comme fallback quand :
 *  - le tenant n'a pas d'emailConfig
 *  - RESEND_API_KEY n'est pas defini en env
 *
 * NB : ne preformatte pas le HTML (layout / subject prefix). C'est l'appelant
 * (EmailService ou TenantEmailDispatcher) qui gere la mise en forme finale.
 */
export class SharedSmtpProvider implements TenantEmailProvider {
  id = 'shared' as const;

  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user && config.smtp.pass
        ? { user: config.smtp.user, pass: config.smtp.pass }
        : undefined,
    });
  }

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    if (!config.smtp.user || !config.smtp.pass) {
      return { ok: false, error: 'SMTP non configure (SMTP_USER/SMTP_PASS manquants)' };
    }
    try {
      const info = await this.transporter.sendMail({
        from: params.from ?? config.smtp.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo,
        attachments: params.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      });
      return { ok: true, providerMessageId: info.messageId };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
