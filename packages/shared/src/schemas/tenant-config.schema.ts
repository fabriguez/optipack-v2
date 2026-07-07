/**
 * Tenant-level configuration shapes for the public site, app mobile and email.
 * These are stored as JSON columns on Organization. Validated by the API on
 * write, and serialized in the public /tenant-meta response (without secrets).
 */

import { z } from 'zod';

// ---- Email config ----

export const emailProviderSchema = z.enum(['resend', 'sendgrid', 'ses', 'shared']);
export type EmailProvider = z.infer<typeof emailProviderSchema>;

export const emailDkimStatusSchema = z.enum(['pending', 'verified', 'failed']);
export type EmailDkimStatus = z.infer<typeof emailDkimStatusSchema>;

/** Full config as stored. Secrets present. */
export const emailConfigSchema = z.object({
  provider: emailProviderSchema.default('shared'),
  /** e.g. "no-reply@acme.com". If absent and provider='shared', we use the platform's shared sender. */
  senderEmail: z.string().email().optional(),
  /** Display name in the From header. */
  senderName: z.string().min(1).max(80).optional(),
  /** Reply-to address used by the recipient when they hit "reply". */
  replyTo: z.string().email().optional(),
  /** Per-provider credentials. Stored as-is in DB column (encrypt at rest at infra level). */
  credentials: z
    .object({
      apiKey: z.string().optional(),
      region: z.string().optional(),
      sender: z.string().optional(),
    })
    .partial()
    .optional(),
  /** Last verification timestamp (ISO). */
  verifiedAt: z.string().datetime().optional(),
  dkimStatus: emailDkimStatusSchema.optional(),
  /** DNS records the tenant must add (rendered by the API on setup). */
  dnsRecords: z
    .array(
      z.object({
        type: z.enum(['TXT', 'CNAME', 'MX']),
        name: z.string(),
        value: z.string(),
      }),
    )
    .optional(),
});
export type EmailConfig = z.infer<typeof emailConfigSchema>;

/** Public-facing config (secrets stripped). Sent to /tenant-meta. */
export const emailConfigPublicSchema = emailConfigSchema
  .omit({ credentials: true })
  .extend({
    /** Last 4 chars of the API key for UI display ("****abcd"). */
    apiKeyHint: z.string().optional(),
  });
export type EmailConfigPublic = z.infer<typeof emailConfigPublicSchema>;

// ---- Mobile app config ----

export const mobileAppModeSchema = z.enum(['shared', 'white_label']);
export type MobileAppMode = z.infer<typeof mobileAppModeSchema>;

export const mobileAppBuildStatusSchema = z.enum([
  'idle',
  'queued',
  'building',
  'published',
  'failed',
]);
export type MobileAppBuildStatus = z.infer<typeof mobileAppBuildStatusSchema>;

export const mobileAppConfigSchema = z.object({
  mode: mobileAppModeSchema.default('shared'),
  /** Display name on the home screen + store. Real default (tenant name) is resolved API-side. */
  appName: z.string().min(1).max(30).default('Application'),
  /** Icon (1024x1024 PNG recommended). */
  iconUrl: z.string().url().optional(),
  /** Splash screen (2732x2732 PNG recommended). */
  splashUrl: z.string().url().optional(),
  /** Primary color used by the native splash and status bar. */
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  /** iOS bundle id (white_label only). */
  bundleId: z
    .string()
    .regex(/^[a-z0-9]+(\.[a-z0-9]+)+$/i)
    .optional(),
  /** Android package id (white_label only). */
  packageId: z
    .string()
    .regex(/^[a-z0-9]+(\.[a-z0-9]+)+$/i)
    .optional(),
  buildStatus: mobileAppBuildStatusSchema.default('idle'),
  storeLinks: z
    .object({
      ios: z.string().url().optional(),
      android: z.string().url().optional(),
    })
    .partial()
    .optional(),
});
export type MobileAppConfig = z.infer<typeof mobileAppConfigSchema>;

// ---- Notification channel config ----

/** Bascules globales des canaux (master on/off). */
export const notificationGlobalChannelsSchema = z.object({
  email: z.boolean().default(true),
  whatsapp: z.boolean().default(true),
  sms: z.boolean().default(false),
  push: z.boolean().default(false),
});
export type NotificationGlobalChannels = z.infer<typeof notificationGlobalChannelsSchema>;

/** Config par-event : quels canaux sont actifs pour cet event. */
export const notificationEventChannelsSchema = z.object({
  email: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
  sms: z.boolean().optional(),
  push: z.boolean().optional(),
});
export type NotificationEventChannels = z.infer<typeof notificationEventChannelsSchema>;

/**
 * Configuration complète des notifications d'un tenant.
 *
 * Logique de résolution :
 *  1. Si `channels.<canal>` est false → canal totalement désactivé pour ce tenant.
 *  2. Si `events.<kind>.<canal>` est false → canal désactivé pour cet event uniquement.
 *  3. Si `events.<kind>.<canal>` est undefined → suit la valeur globale `channels.<canal>`.
 *
 * Les templates HTML / WhatsApp / SMS personnalisés sont stockés dans
 * TenantNotificationTemplate (table dédiée) pour éviter un JSON trop lourd.
 */
export const notificationChannelConfigSchema = z.object({
  /** Canaux globaux (master switches). Si absent, comportement défaut. */
  channels: notificationGlobalChannelsSchema.optional(),
  /**
   * Config par event. Clé = event kind (PARCEL_CREATED, PAYMENT_RECEIVED, …).
   * Seuls les overrides sont stockés — undefined = comportement global.
   */
  events: z.record(z.string(), notificationEventChannelsSchema).optional(),
});
export type NotificationChannelConfig = z.infer<typeof notificationChannelConfigSchema>;

export const DEFAULT_NOTIFICATION_GLOBAL_CHANNELS: NotificationGlobalChannels = {
  email: true,
  whatsapp: true,
  sms: false,
  push: false,
};

/** Defaults when Organization.notificationConfig is null. */
export const DEFAULT_NOTIFICATION_CHANNEL_CONFIG: NotificationChannelConfig = {
  channels: DEFAULT_NOTIFICATION_GLOBAL_CHANNELS,
  events: {},
};
