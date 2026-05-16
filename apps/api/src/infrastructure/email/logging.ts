/**
 * Pretty, human-scannable logs for email + notification dispatch.
 *
 * Pourquoi un helper plutot que pino direct :
 *  - On scanne souvent les logs en dev pour voir "quel mail vient de partir,
 *    via quel provider, pour quel tenant". JSON pur est illisible a vue d'oeil.
 *  - Format ASCII fixe : sujet tronque, destinataire, provider, tenant,
 *    statut (OK / FAIL / SKIP) avec marqueurs visuels.
 *  - Garde aussi la sortie pino structuree (filtrable en prod).
 */

import { createChildLogger } from '../../config/logger';

const logger = createChildLogger('Email');

export type EmailLogStatus = 'OK' | 'FAIL' | 'SKIP';

interface EmailLogFields {
  status: EmailLogStatus;
  provider: 'resend' | 'shared' | 'env-resend' | 'smtp' | string;
  to: string;
  subject: string;
  event?: string;
  organizationId?: string | null;
  tenantName?: string | null;
  providerMessageId?: string;
  error?: string;
  durationMs?: number;
}

const ICONS: Record<EmailLogStatus, string> = {
  OK: '✓',
  FAIL: '✗',
  SKIP: '·',
};

function truncate(value: string, max: number): string {
  if (!value) return '';
  return value.length <= max ? value : value.slice(0, max - 1) + '…';
}

/**
 * Log emis sur stdout en une ligne lisible, ex :
 *   [Email ✓] resend  -> alice@acme.cm        "Colis enregistre - TR-001"   tenant=Acme org=abc123 (243ms)
 */
export function logEmail(fields: EmailLogFields): void {
  const icon = ICONS[fields.status];
  const provider = fields.provider.padEnd(10);
  const to = truncate(fields.to, 32).padEnd(34);
  const subject = `"${truncate(fields.subject, 50)}"`;
  const tenant = fields.tenantName ? `tenant=${truncate(fields.tenantName, 24)}` : '';
  const org = fields.organizationId ? `org=${fields.organizationId.slice(0, 8)}` : 'org=shared';
  const evt = fields.event ? `evt=${fields.event}` : '';
  const duration = fields.durationMs != null ? `(${fields.durationMs}ms)` : '';
  const tail = fields.status === 'FAIL' && fields.error ? `  reason: ${truncate(fields.error, 120)}` : '';
  const line = `[Email ${icon}] ${provider} -> ${to} ${subject}  ${[evt, tenant, org, duration].filter(Boolean).join(' ')}${tail}`;

  if (fields.status === 'OK') logger.info(fields, line);
  else if (fields.status === 'FAIL') logger.error(fields, line);
  else logger.warn(fields, line);
}

/**
 * Log multi-canal pour NotificationService. Une ligne par canal.
 *   [Notif ✓] IN_APP    user=user_abc  "Colis arrive"  evt=PARCEL_ARRIVED
 *   [Notif ✓] EMAIL     to=alice@x.cm  "Colis arrive"  org=acme
 *   [Notif ·] WHATSAPP  SKIPPED        "Colis arrive"  reason=provider non configure
 */
export function logChannelDelivery(fields: {
  status: EmailLogStatus;
  channel: string;
  title: string;
  target?: string;
  organizationId?: string | null;
  event?: string;
  error?: string;
}): void {
  const icon = ICONS[fields.status];
  const channel = fields.channel.padEnd(10);
  const target = fields.target ? truncate(fields.target, 32) : (fields.status === 'SKIP' ? 'SKIPPED' : '-');
  const title = `"${truncate(fields.title, 50)}"`;
  const evt = fields.event ? `evt=${fields.event}` : '';
  const org = fields.organizationId ? `org=${fields.organizationId.slice(0, 8)}` : '';
  const tail = fields.status !== 'OK' && fields.error ? `  reason: ${truncate(fields.error, 120)}` : '';
  const line = `[Notif ${icon}] ${channel} ${target.padEnd(34)} ${title}  ${[evt, org].filter(Boolean).join(' ')}${tail}`;

  if (fields.status === 'OK') logger.info(fields, line);
  else if (fields.status === 'FAIL') logger.error(fields, line);
  else logger.warn(fields, line);
}
