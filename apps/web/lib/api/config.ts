import { apiClient } from './client';

// ── System Config ──────────────────────────────────────────

export const configApi = {
  list: () =>
    apiClient.get('/config').then((r) => r.data),

  update: (key: string, value: string) =>
    apiClient.put(`/config/${key}`, { value }).then((r) => r.data),
};

// ── Currencies ─────────────────────────────────────────────

export interface CurrencyInput {
  code: string;
  name: string;
  symbol: string;
  exchangeRate: number;
  isBase?: boolean;
}

export const currenciesApi = {
  list: () =>
    apiClient.get('/currencies').then((r) => r.data),

  create: (data: CurrencyInput) =>
    apiClient.post('/currencies', data).then((r) => r.data),

  update: (id: string, data: Partial<CurrencyInput & { isActive: boolean }>) =>
    apiClient.patch(`/currencies/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    apiClient.delete(`/currencies/${id}`).then((r) => r.data),
};

// ── Notification Config ────────────────────────────────────

export interface NotificationGlobalChannels {
  email: boolean;
  whatsapp: boolean;
  sms: boolean;
  push: boolean;
}

export interface NotificationEventChannels {
  email?: boolean;
  whatsapp?: boolean;
  sms?: boolean;
  push?: boolean;
}

export interface NotificationConfig {
  channels: NotificationGlobalChannels;
  events: Record<string, NotificationEventChannels>;
}

export interface NotificationEventVariable {
  name: string;
  label: string;
  example: string;
}

export interface NotificationEventAttachment {
  key: string;
  label: string;
  description: string;
}

export interface NotificationEventDef {
  kind: string;
  label: string;
  description: string;
  category: string;
  recipient: 'client' | 'admin' | 'both';
  variables: NotificationEventVariable[];
  attachments: NotificationEventAttachment[];
}

export interface NotificationTemplate {
  id: string;
  organizationId: string;
  eventKind: string;
  channel: string;
  subject?: string | null;
  body: string;
  attachments?: Record<string, boolean> | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export const notificationConfigApi = {
  getConfig: () =>
    apiClient.get<{ success: boolean; data: NotificationConfig }>('/notification-config').then((r) => r.data.data),

  patchChannels: (channels: Partial<NotificationGlobalChannels>) =>
    apiClient.patch('/notification-config/channels', channels).then((r) => r.data),

  patchEventChannels: (kind: string, channels: NotificationEventChannels) =>
    apiClient.patch(`/notification-config/events/${kind}`, channels).then((r) => r.data),

  listTemplates: () =>
    apiClient.get<{ success: boolean; data: NotificationTemplate[] }>('/notification-templates').then((r) => r.data.data),

  upsertTemplate: (eventKind: string, channel: string, data: { subject?: string; body: string; attachments?: Record<string, boolean>; isActive?: boolean }) =>
    apiClient.put(`/notification-templates/${eventKind}/${channel}`, data).then((r) => r.data),

  deleteTemplate: (eventKind: string, channel: string) =>
    apiClient.delete(`/notification-templates/${eventKind}/${channel}`).then((r) => r.data),

  listEvents: () =>
    apiClient.get<{ success: boolean; data: NotificationEventDef[] }>('/notification-events').then((r) => r.data.data),
};

// ── WhatsApp Personnel ─────────────────────────────────────

/**
 * État de la session WhatsApp du tenant, adossée à l'API WhatsApp interne.
 * `status` = statut renvoyé par l'API externe (`connected`, `qr`, `connecting`,
 * `disconnected`, `logged_out`...) ou statut local
 * (`NOT_CONFIGURED`, `NO_BASE_URL`, `UNREACHABLE`).
 */
export interface WaSessionState {
  enabled: boolean;
  configured: boolean;
  baseUrl: string | null;
  status: string;
  connectedPhone: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
}

export interface WaConfigInput {
  enabled?: boolean;
  /** Chaîne vide = effacer la clé. Absent = inchangé. */
  apiKey?: string;
  /** Chaîne vide = base URL globale. Absent = inchangé. */
  baseUrl?: string;
}

export interface WaTestResult {
  id: string;
  name: string;
  phoneNumber: string | null;
  status: string;
  rateLimitPerMin: number;
}

export const whatsappPersonalApi = {
  getStatus: () =>
    apiClient
      .get<{ success: boolean; data: WaSessionState }>('/whatsapp-personal/status')
      .then((r) => r.data.data),

  saveConfig: (input: WaConfigInput) =>
    apiClient
      .put<{ success: boolean; data: WaSessionState }>('/whatsapp-personal/config', input)
      .then((r) => r.data.data),

  testConnection: (input: Pick<WaConfigInput, 'apiKey' | 'baseUrl'> = {}) =>
    apiClient
      .post<{ success: boolean; data: WaTestResult }>('/whatsapp-personal/test', input)
      .then((r) => r.data.data),

  clear: () => apiClient.delete('/whatsapp-personal/config').then((r) => r.data),
};

// ── Wapino (fallback WhatsApp) ─────────────────────────────

/**
 * Config Wapino du tenant (https://wapino.consolidis.com) — canal WhatsApp de
 * SECOURS, tenté après le canal personnel. Les deux peuvent être configurés
 * et connectés en même temps. Pas de statut de session live côté clé API :
 * l'état se limite à configured/enabled + dernier envoi OK / dernière erreur.
 */
export interface WapinoState {
  enabled: boolean;
  configured: boolean;
  instance: string | null;
  baseUrl: string;
  lastError: string | null;
  lastOkAt: string | null;
}

export interface WapinoConfigInput {
  enabled?: boolean;
  /** Chaîne vide = effacer. Absent = inchangé. */
  apiKey?: string;
  instance?: string;
  /** Chaîne vide = base par défaut. Absent = inchangé. */
  baseUrl?: string;
}

export const wapinoApi = {
  getStatus: () =>
    apiClient
      .get<{ success: boolean; data: WapinoState }>('/wapino/status')
      .then((r) => r.data.data),

  saveConfig: (input: WapinoConfigInput) =>
    apiClient
      .put<{ success: boolean; data: WapinoState }>('/wapino/config', input)
      .then((r) => r.data.data),

  /** Envoie un vrai message de test au numéro fourni. */
  testConnection: (input: { phone: string } & Omit<WapinoConfigInput, 'enabled'>) =>
    apiClient.post('/wapino/test', input).then((r) => r.data),

  clear: () => apiClient.delete('/wapino/config').then((r) => r.data),
};

// ── Reports ────────────────────────────────────────────────

export interface ReportParams {
  startDate?: string;
  endDate?: string;
  agencyId?: string;
  status?: string;
}

export const reportsApi = {
  parcels: (params: ReportParams) =>
    apiClient.get('/reports/parcels', { params }).then((r) => r.data),

  payments: (params: ReportParams) =>
    apiClient.get('/reports/payments', { params }).then((r) => r.data),

  revenue: (params: ReportParams) =>
    apiClient.get('/reports/revenue', { params }).then((r) => r.data),

  debts: (params: ReportParams) =>
    apiClient.get('/reports/debts', { params }).then((r) => r.data),

  cashFlow: (params: ReportParams) =>
    apiClient.get('/reports/cash-flow', { params }).then((r) => r.data),

  penalties: (params: ReportParams) =>
    apiClient.get('/reports/penalties', { params }).then((r) => r.data),
};
