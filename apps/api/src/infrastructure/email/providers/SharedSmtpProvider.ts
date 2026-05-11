import { emailService } from '../EmailService';
import type {
  EmailSendParams,
  EmailSendResult,
  TenantEmailProvider,
} from './types';

/**
 * Adapter wrapping the existing nodemailer-based EmailService so the
 * provider-aware dispatcher can use it as the 'shared' fallback (tenants
 * who haven't configured their own provider).
 *
 * Note : the legacy EmailService prepends "TransitSoftServices - " to the
 * subject and wraps the body in emailLayout(). When we go through this
 * adapter we use its public `send(to, subject, body)` shape so existing
 * templates keep working.
 */
export class SharedSmtpProvider implements TenantEmailProvider {
  id = 'shared' as const;

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    const ok = await emailService.send(params.to, params.subject, params.html);
    return ok ? { ok: true } : { ok: false, error: 'shared SMTP rejected' };
  }
}
