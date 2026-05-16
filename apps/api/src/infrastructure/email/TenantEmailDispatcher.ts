import type { EmailConfig } from '@transitsoftservices/shared';
import { config } from '../../config';
import { prisma } from '../../config/database';
import { ResendProvider } from './providers/ResendProvider';
import { SharedSmtpProvider } from './providers/SharedSmtpProvider';
import { logEmail } from './logging';
import type {
  DomainVerifyOutcome,
  EmailSendParams,
  EmailSendResult,
  TenantEmailProvider,
} from './providers/types';

/**
 * Dispatcher email tenant-aware.
 *
 * Cascade de resolution :
 *  1. Tenant a un emailConfig.provider == 'resend' + credentials valides
 *     -> ResendProvider avec sa propre cle API et son sender domain.
 *  2. Sinon (pas de config OU provider == 'shared' OU credentials invalides) :
 *     a. Si RESEND_API_KEY defini en env -> Resend partage OptiPack.
 *     b. Sinon -> SharedSmtpProvider (nodemailer SMTP).
 *
 * Pourquoi cette cascade : le "tenant principal" (sans emailConfig) tombait
 * sur SMTP qui n'est pas toujours configure -> mails perdus. Avec Resend en
 * fallback systeme, on a une livrabilite robuste meme sans setup tenant.
 */

const sharedSmtp = new SharedSmtpProvider();
const sharedResend = config.resend.apiKey
  ? new ResendProvider(config.resend.apiKey, config.resend.from)
  : null;

const tenantNameCache = new Map<string, string>();

async function getTenantName(organizationId: string): Promise<string | null> {
  const cached = tenantNameCache.get(organizationId);
  if (cached) return cached;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });
  if (org?.name) {
    tenantNameCache.set(organizationId, org.name);
    return org.name;
  }
  return null;
}

class TenantEmailDispatcher {
  /**
   * Envoie un email pour un tenant. organizationId == null/undefined =>
   * utilise directement le sender partage (Resend env si dispo, sinon SMTP).
   */
  async sendForTenant(
    organizationId: string | null | undefined,
    params: EmailSendParams,
    meta?: { event?: string },
  ): Promise<EmailSendResult> {
    const started = Date.now();
    const tenantName = organizationId ? await getTenantName(organizationId) : null;

    const provider = organizationId
      ? await this.resolveTenantProvider(organizationId)
      : this.resolveSharedProvider();

    const providerLabel = provider.id === 'resend' && organizationId
      ? 'resend'
      : provider.id === 'resend'
        ? 'env-resend'
        : provider.id;

    const result = await provider.send(params);
    const durationMs = Date.now() - started;

    if (result.ok) {
      logEmail({
        status: 'OK',
        provider: providerLabel,
        to: params.to,
        subject: params.subject,
        event: meta?.event,
        organizationId: organizationId ?? null,
        tenantName,
        providerMessageId: result.providerMessageId,
        durationMs,
      });
      return result;
    }

    // Tenant provider failed -> retry via shared provider (cascade).
    if (provider.id === 'resend' && organizationId) {
      logEmail({
        status: 'FAIL',
        provider: 'resend',
        to: params.to,
        subject: params.subject,
        event: meta?.event,
        organizationId,
        tenantName,
        error: result.error + ' (retry via shared)',
        durationMs,
      });
      const shared = this.resolveSharedProvider();
      const retryStarted = Date.now();
      const retry = await shared.send(params);
      const retryDuration = Date.now() - retryStarted;
      logEmail({
        status: retry.ok ? 'OK' : 'FAIL',
        provider: shared.id === 'resend' ? 'env-resend' : 'smtp',
        to: params.to,
        subject: params.subject,
        event: meta?.event,
        organizationId,
        tenantName,
        error: retry.ok ? undefined : retry.error,
        durationMs: retryDuration,
      });
      return retry;
    }

    logEmail({
      status: 'FAIL',
      provider: providerLabel,
      to: params.to,
      subject: params.subject,
      event: meta?.event,
      organizationId: organizationId ?? null,
      tenantName,
      error: result.error,
      durationMs,
    });
    return result;
  }

  /** Choisit le provider du tenant en lisant Organization.emailConfig. */
  private async resolveTenantProvider(organizationId: string): Promise<TenantEmailProvider> {
    const org = (await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { emailConfig: true },
    })) as { emailConfig: EmailConfig | null } | null;

    const cfg = org?.emailConfig;
    if (!cfg || cfg.provider === 'shared') return this.resolveSharedProvider();

    const sender =
      cfg.senderEmail && cfg.senderName
        ? `${cfg.senderName} <${cfg.senderEmail}>`
        : cfg.senderEmail ?? '';

    switch (cfg.provider) {
      case 'resend': {
        const key = cfg.credentials?.apiKey;
        if (!key || !sender) return this.resolveSharedProvider();
        return new ResendProvider(key, sender);
      }
      // sendgrid / ses : a implementer, fallback shared en attendant.
      default:
        return this.resolveSharedProvider();
    }
  }

  /** Provider "shared" OptiPack : Resend env > SMTP. */
  private resolveSharedProvider(): TenantEmailProvider {
    return sharedResend ?? sharedSmtp;
  }

  /** Verification DKIM domaine pour un tenant Resend. */
  async registerOrVerifyDomain(
    organizationId: string,
    domain: string,
  ): Promise<DomainVerifyOutcome> {
    const provider = await this.resolveTenantProvider(organizationId);
    if (provider.id !== 'resend') {
      return {
        status: 'failed',
        dnsRecords: [],
        message: 'Domain verification supported only when provider=resend.',
      };
    }
    return (provider as ResendProvider).createOrFetchDomain(domain);
  }

  async retriggerDomainVerification(
    organizationId: string,
    domain: string,
  ): Promise<DomainVerifyOutcome> {
    const provider = await this.resolveTenantProvider(organizationId);
    if (provider.id !== 'resend') {
      return {
        status: 'failed',
        dnsRecords: [],
        message: 'Verification supported only when provider=resend.',
      };
    }
    return (provider as ResendProvider).verifyDomain(domain);
  }

  /** Invalide le cache (a appeler quand un admin change le nom de l'org). */
  invalidateTenantCache(organizationId: string) {
    tenantNameCache.delete(organizationId);
  }
}

export const tenantEmailDispatcher = new TenantEmailDispatcher();
