/**
 * Provider abstraction for transactional email. Each tenant can pick its own
 * provider via Organization.emailConfig. If none is set, we fall back to the
 * shared platform sender (existing SMTP transport).
 */

import type { EmailProvider } from '@transitsoftservices/shared';

export interface EmailSendParams {
  to: string;
  subject: string;
  html: string;
  /** Plain-text fallback. Auto-derived from html if absent. */
  text?: string;
  /** "Acme Transit <no-reply@acme.com>". If absent, provider uses its configured default sender. */
  from?: string;
  replyTo?: string;
  /** Tag/category for the provider analytics. */
  tag?: string;
  /** Optional file attachments (e.g. PDF reports). */
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
  }>;
}

export interface EmailSendResult {
  ok: boolean;
  /** Provider-side id, useful for webhooks + retries. */
  providerMessageId?: string;
  error?: string;
}

export interface TenantEmailProvider {
  id: EmailProvider;
  send(params: EmailSendParams): Promise<EmailSendResult>;
}

export interface DomainVerifyOutcome {
  status: 'pending' | 'verified' | 'failed';
  dnsRecords: Array<{ type: 'TXT' | 'CNAME' | 'MX'; name: string; value: string }>;
  message?: string;
}
