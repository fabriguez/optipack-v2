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
 *     a. Si RESEND_API_KEY defini en env -> Resend partage plateforme.
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

type TenantIdentity = { name: string | null; slug: string | null };

const tenantIdentityCache = new Map<string, TenantIdentity>();

async function getTenantIdentity(organizationId: string): Promise<TenantIdentity> {
  const cached = tenantIdentityCache.get(organizationId);
  if (cached) return cached;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true, slug: true },
  });
  const identity: TenantIdentity = { name: org?.name ?? null, slug: org?.slug ?? null };
  if (org) tenantIdentityCache.set(organizationId, identity);
  return identity;
}

/**
 * From plateforme "brande" avec le slug tenant, sur le domaine Resend deja
 * verifie : ex. "Acme Transit <acme@transitsoftservices.com>". A n'utiliser
 * que quand l'envoi passe par le Resend partage (domaine controle) -- jamais
 * en SMTP (sender doit etre autorise) ni sur le Resend dedie du tenant.
 */
function platformTenantFrom(identity: TenantIdentity | null): string | undefined {
  const slug = identity?.slug?.trim().toLowerCase();
  if (!slug) return undefined;
  // Tenant principal : local-part fixe (contact@...) au lieu de son slug.
  const local = slug === config.resend.primarySlug ? config.resend.primaryLocalPart : slug;
  const display = identity?.name?.trim() || 'TransitSoftServices';
  return `${display} <${local}@${config.resend.tenantDomain}>`;
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
    const identity = organizationId ? await getTenantIdentity(organizationId) : null;
    const tenantName = identity?.name ?? null;

    const provider = organizationId
      ? await this.resolveTenantProvider(organizationId)
      : this.resolveSharedProvider();

    // Envoi via le Resend plateforme (domaine verifie) => on brande le From
    // avec le slug tenant. On ne touche pas si l'appelant a deja fixe un From,
    // ni si le provider est SMTP ou le Resend dedie du tenant.
    if (organizationId && provider === sharedResend && !params.from) {
      const from = platformTenantFrom(identity);
      if (from) params.from = from;
    }

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
      if (shared === sharedResend) {
        // Le From du tenant dedie n'est pas valide sur le domaine plateforme :
        // on rebascule sur le From brande "<slug>@tenantDomain".
        const from = platformTenantFrom(identity);
        params.from = from ?? undefined;
      }
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

  /** Provider "shared" plateforme : Resend env > SMTP. */
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
    tenantIdentityCache.delete(organizationId);
  }
}

export const tenantEmailDispatcher = new TenantEmailDispatcher();
