import type { EmailConfig } from '@transitsoftservices/shared';
import { prisma } from '../../config/database';
import { createChildLogger } from '../../config/logger';
import { ResendProvider } from './providers/ResendProvider';
import { SharedSmtpProvider } from './providers/SharedSmtpProvider';
import type {
  DomainVerifyOutcome,
  EmailSendParams,
  EmailSendResult,
  TenantEmailProvider,
} from './providers/types';

const logger = createChildLogger('TenantEmailDispatcher');

/**
 * Per-tenant email sender. Picks the right provider based on
 * Organization.emailConfig, and falls back to the shared OptiPack sender if
 * none configured or if the tenant's provider key is missing/invalid.
 *
 * Adding a new provider :
 *  1. Add an entry to EmailProvider in shared/schemas/tenant-config.schema.ts
 *  2. Add a class implementing TenantEmailProvider
 *  3. Add a case in `resolveProvider()` below
 */
class TenantEmailDispatcher {
  private shared = new SharedSmtpProvider();

  async sendForTenant(
    organizationId: string,
    params: EmailSendParams,
  ): Promise<EmailSendResult> {
    const provider = await this.resolveProvider(organizationId);
    if (!provider) {
      logger.warn({ organizationId }, 'No provider resolved, falling back to shared');
      return this.shared.send(params);
    }
    const result = await provider.send(params);
    if (!result.ok && provider.id !== 'shared') {
      logger.warn(
        { organizationId, providerId: provider.id, error: result.error },
        'Tenant provider failed - falling back to shared',
      );
      return this.shared.send(params);
    }
    return result;
  }

  /**
   * Per-tenant provider lookup. Caches nothing for now (config rarely changes,
   * and the tenant-meta endpoint typically calls this with fresh state).
   */
  async resolveProvider(organizationId: string): Promise<TenantEmailProvider | null> {
    const org = (await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { emailConfig: true },
    })) as { emailConfig: EmailConfig | null } | null;

    const cfg = org?.emailConfig;
    if (!cfg || cfg.provider === 'shared') return this.shared;

    const sender =
      cfg.senderEmail && cfg.senderName
        ? `${cfg.senderName} <${cfg.senderEmail}>`
        : cfg.senderEmail ?? '';

    switch (cfg.provider) {
      case 'resend': {
        const key = cfg.credentials?.apiKey;
        if (!key || !sender) return null;
        return new ResendProvider(key, sender);
      }
      // 'sendgrid' / 'ses' to implement when needed - return null = fallback
      default:
        return null;
    }
  }

  /**
   * Domain registration & DKIM verification for the tenant's chosen provider.
   * Currently only Resend is wired (it covers our default + most pilot tenants).
   */
  async registerOrVerifyDomain(
    organizationId: string,
    domain: string,
  ): Promise<DomainVerifyOutcome> {
    const provider = await this.resolveProvider(organizationId);
    if (!provider || provider.id !== 'resend') {
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
    const provider = await this.resolveProvider(organizationId);
    if (!provider || provider.id !== 'resend') {
      return {
        status: 'failed',
        dnsRecords: [],
        message: 'Verification supported only when provider=resend.',
      };
    }
    return (provider as ResendProvider).verifyDomain(domain);
  }
}

export const tenantEmailDispatcher = new TenantEmailDispatcher();
