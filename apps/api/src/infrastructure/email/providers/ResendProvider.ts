import { createChildLogger } from '../../../config/logger';
import type {
  DomainVerifyOutcome,
  EmailSendParams,
  EmailSendResult,
  TenantEmailProvider,
} from './types';

const logger = createChildLogger('ResendProvider');

/**
 * Resend (resend.com) provider. Used as the default for new tenants:
 *  - simple HTTP API, no SDK required
 *  - excellent African + global deliverability
 *  - free tier covers ~3k/month per tenant
 *
 * Per-tenant API key + sender are pulled from Organization.emailConfig.
 * Domain verification (DKIM/SPF) happens via Resend's /domains endpoint.
 */
export class ResendProvider implements TenantEmailProvider {
  id = 'resend' as const;

  constructor(
    private readonly apiKey: string,
    private readonly defaultSender: string,
  ) {}

  async send(params: EmailSendParams): Promise<EmailSendResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: params.from ?? this.defaultSender,
          to: [params.to],
          subject: params.subject,
          html: params.html,
          text: params.text,
          reply_to: params.replyTo,
          tags: params.tag ? [{ name: 'category', value: params.tag }] : undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.warn({ status: res.status, body }, 'Resend send failed');
        return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
      }
      const json = (await res.json()) as { id?: string };
      return { ok: true, providerMessageId: json.id };
    } catch (err) {
      logger.error({ err }, 'Resend network error');
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Register a domain with Resend so the tenant can send from it.
   * Returns the DNS records the tenant must add (TXT for DKIM + MX/SPF).
   *
   * Idempotent : if the domain already exists, we just refetch its status.
   */
  async createOrFetchDomain(domain: string): Promise<DomainVerifyOutcome> {
    try {
      // Try to create (Resend is idempotent on duplicate domain).
      const create = await fetch('https://api.resend.com/domains', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: domain }),
      });
      // If 4xx because it already exists, fall through to fetch.
      const data = create.ok ? await create.json() : null;
      const domainId = (data as { id?: string } | null)?.id ?? domain;

      const get = await fetch(`https://api.resend.com/domains/${domainId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!get.ok) {
        return {
          status: 'failed',
          dnsRecords: [],
          message: `Resend domain fetch ${get.status}`,
        };
      }
      const detail = (await get.json()) as {
        status?: 'pending' | 'verified' | 'failed';
        records?: Array<{ type: string; name: string; value: string }>;
      };
      return {
        status: detail.status ?? 'pending',
        dnsRecords:
          detail.records?.map((r) => ({
            type: (r.type === 'CNAME' ? 'CNAME' : r.type === 'MX' ? 'MX' : 'TXT') as
              | 'TXT'
              | 'CNAME'
              | 'MX',
            name: r.name,
            value: r.value,
          })) ?? [],
      };
    } catch (err) {
      return {
        status: 'failed',
        dnsRecords: [],
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Re-trigger verification on Resend. */
  async verifyDomain(domain: string): Promise<DomainVerifyOutcome> {
    try {
      const res = await fetch(
        `https://api.resend.com/domains/${domain}/verify`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.apiKey}` },
        },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { status: 'failed', dnsRecords: [], message: body.slice(0, 200) };
      }
      return this.createOrFetchDomain(domain);
    } catch (err) {
      return {
        status: 'failed',
        dnsRecords: [],
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
