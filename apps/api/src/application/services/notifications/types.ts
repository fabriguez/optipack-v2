/**
 * Types partages du systeme de notification multi-canal.
 *
 * Modele :
 *  - Une "Notification" metier = un evenement a notifier (ex: "Colis arrive a destination")
 *  - Elle peut etre dispatched sur N canaux : IN_APP, EMAIL, SMS, WHATSAPP, PUSH
 *  - Chaque canal cree son propre row Notification (pour audit + statut par canal)
 *  - Les canaux sont best-effort : echec d'un canal n'annule pas les autres
 */

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

/** Cible : un seul user OU un seul client. agencyId est metadonnee. */
export interface NotificationTarget {
  userId?: string | null;
  clientId?: string | null;
  agencyId?: string | null;
  organizationId?: string | null;
  /** Coordonnees explicites (override des donnees DB du client/user). */
  email?: string | null;
  phone?: string | null;
}

/** Piece jointe envoyee via WhatsApp (URL publique accessible par le provider). */
export interface NotificationAttachment {
  url: string;
  filename: string;
  caption?: string;
}

export interface NotificationPayload {
  /** Titre court (utilise pour push, email subject, etc). */
  title: string;
  /** Corps texte (in-app, sms, whatsapp). Email HTML genere a part. */
  message: string;
  /** Donnees structurees attachees (deep-linking, refs metier). */
  metadata?: Record<string, unknown>;
  /** Canaux a essayer. IN_APP est toujours inclus par defaut. */
  channels?: NotificationChannel[];
  /** Optionnel : template d'email pre-defini (sinon body plain text). */
  emailTemplate?: 'plain' | 'parcel-status' | 'payment-receipt' | string;
  /** Fichiers joints (WhatsApp uniquement). URLs publiques presignees MinIO. */
  attachments?: NotificationAttachment[];
  /**
   * Variables de rendu pour les templates personnalises du tenant.
   * Si presents, les canaux EMAIL/WHATSAPP/SMS cherchent un template en DB
   * avant d'utiliser le message par defaut.
   */
  templateVariables?: Record<string, string | number | undefined | null>;
}

export interface ChannelDeliveryResult {
  channel: NotificationChannel;
  status: 'SENT' | 'FAILED' | 'SKIPPED';
  notificationId?: string;
  error?: string;
}

export interface NotificationResult {
  results: ChannelDeliveryResult[];
}

/**
 * Provider abstrait pour un canal externe (SMS, WhatsApp, Push).
 * Permet de brancher Twilio / Africa's Talking / Vonage / Meta sans toucher
 * au reste du systeme. Si pas de provider configure, le canal est SKIPPED.
 */
export interface ExternalChannelProvider {
  readonly name: string;
  readonly enabled: boolean;
  send(to: string, message: string, meta?: Record<string, unknown>): Promise<void>;
  /** Envoi d'un document/fichier (PDF...). Optionnel : si absent, la piece jointe est ignoree. */
  sendDocument?(to: string, url: string, filename: string, caption?: string): Promise<void>;
}
