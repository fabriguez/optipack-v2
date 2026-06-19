/**
 * Registre de tous les events de notification du système.
 * Pour chaque event : libellé, description, variables disponibles,
 * et pièces jointes disponibles pour les templates personnalisés.
 *
 * Les variables sont rendues via {{variable}} dans les templates.
 * Le moteur de rendu est dans NotificationTemplateRenderer (API).
 */

export type EventVariableDefinition = {
  name: string;
  label: string;
  example: string;
};

export type EventAttachmentDefinition = {
  key: string;
  label: string;
  description: string;
};

export type NotificationEventDefinition = {
  kind: string;
  label: string;
  description: string;
  category: 'parcel' | 'payment' | 'invoice' | 'loyalty' | 'container' | 'admin';
  /** Destinataire principal de la notification */
  recipient: 'client' | 'admin' | 'both';
  variables: EventVariableDefinition[];
  attachments: EventAttachmentDefinition[];
};

export const NOTIFICATION_EVENT_REGISTRY: NotificationEventDefinition[] = [
  // ── COLIS ────────────────────────────────────────────────────────────────
  {
    kind: 'PARCEL_CREATED',
    label: 'Colis enregistré',
    description: "Déclenché à la création d'un colis (enregistrement initial).",
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'destination', label: 'Destination', example: 'Douala, Cameroun' },
      { name: 'weight', label: 'Poids (kg)', example: '12.5' },
      { name: 'volume', label: 'Volume (m³)', example: '0.08' },
      { name: 'price', label: 'Prix (XAF)', example: '15 000' },
      { name: 'transitType', label: 'Type de transit', example: 'Maritime' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Yaoundé Centre' },
      { name: 'trackingUrl', label: 'Lien de suivi', example: 'https://app.exemple.com/tracking/OPT-2024-00142' },
    ],
    attachments: [],
  },
  {
    kind: 'PARCEL_LOADING',
    label: 'Colis en chargement',
    description: 'Déclenché quand le colis passe au statut LOADING (préparation au chargement dans un conteneur).',
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Yaoundé Centre' },
      { name: 'trackingUrl', label: 'Lien de suivi', example: 'https://app.exemple.com/tracking/OPT-2024-00142' },
    ],
    attachments: [],
  },
  {
    kind: 'PARCEL_LOADED',
    label: 'Colis chargé dans conteneur',
    description: 'Déclenché quand le colis est physiquement chargé dans un conteneur.',
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'containerName', label: 'Nom du conteneur', example: 'CTN-Yaoundé-012' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Yaoundé Centre' },
      { name: 'trackingUrl', label: 'Lien de suivi', example: 'https://app.exemple.com/tracking/OPT-2024-00142' },
    ],
    attachments: [],
  },
  {
    kind: 'PARCEL_IN_TRANSIT',
    label: 'Colis en transit',
    description: 'Déclenché quand le colis est en cours d\'acheminement vers sa destination.',
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Yaoundé Centre' },
      { name: 'trackingUrl', label: 'Lien de suivi', example: 'https://app.exemple.com/tracking/OPT-2024-00142' },
    ],
    attachments: [],
  },
  {
    kind: 'PARCEL_ARRIVED',
    label: 'Colis arrivé à destination',
    description: 'Déclenché quand le colis arrive à l\'agence de destination et est disponible au retrait.',
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence de destination', example: 'Agence Douala Port' },
      { name: 'trackingUrl', label: 'Lien de suivi', example: 'https://app.exemple.com/tracking/OPT-2024-00142' },
    ],
    attachments: [],
  },
  {
    kind: 'PARCEL_RECEIVED',
    label: 'Colis réceptionné en magasin',
    description: 'Déclenché quand le colis est officiellement réceptionné dans les locaux de l\'agence.',
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Douala Port' },
      { name: 'trackingUrl', label: 'Lien de suivi', example: 'https://app.exemple.com/tracking/OPT-2024-00142' },
    ],
    attachments: [],
  },
  {
    kind: 'PARCEL_DELIVERED',
    label: 'Colis retiré / livré',
    description: 'Déclenché quand le client vient retirer son colis (livraison finalisée).',
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Douala Port' },
    ],
    attachments: [],
  },
  {
    kind: 'PARCEL_UNLOADED',
    label: 'Colis déchargé du conteneur',
    description: 'Déclenché lors du déchargement du conteneur (reçu, non trouvé, ou modifié).',
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'action', label: 'Action (received/not_found/modified)', example: 'received' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Douala Port' },
      { name: 'trackingUrl', label: 'Lien de suivi', example: 'https://app.exemple.com/tracking/OPT-2024-00142' },
    ],
    attachments: [],
  },
  {
    kind: 'PARCEL_DELAYED',
    label: 'Retard d\'acheminement',
    description: 'Déclenché quand un retard est détecté sur le transit d\'un colis.',
    category: 'parcel',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'estimatedArrivalDate', label: 'Date d\'arrivée estimée', example: '15/03/2024' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Yaoundé Centre' },
      { name: 'trackingUrl', label: 'Lien de suivi', example: 'https://app.exemple.com/tracking/OPT-2024-00142' },
    ],
    attachments: [],
  },

  // ── PAIEMENT ─────────────────────────────────────────────────────────────
  {
    kind: 'PAYMENT_RECEIVED',
    label: 'Paiement encaissé',
    description: 'Déclenché à chaque encaissement sur une facture client.',
    category: 'payment',
    recipient: 'client',
    variables: [
      { name: 'amount', label: 'Montant encaissé (XAF)', example: '25 000' },
      { name: 'invoiceRef', label: 'Référence facture', example: 'FAC-2024-0089' },
      { name: 'paymentMethod', label: 'Mode de paiement', example: 'Mobile Money' },
      { name: 'remainingBalance', label: 'Solde restant (XAF)', example: '0' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Yaoundé Centre' },
    ],
    attachments: [
      { key: 'receipt', label: 'Reçu de paiement (PDF)', description: 'Reçu généré automatiquement à partir du paiement.' },
      { key: 'invoice', label: 'Facture (PDF)', description: 'Facture complète avec tous les colis et paiements.' },
    ],
  },

  // ── PÉNALITÉS / STOCKAGE ─────────────────────────────────────────────────
  {
    kind: 'PENALTY_APPLIED',
    label: 'Pénalité de stockage appliquée',
    description: 'Déclenché quand une pénalité de stockage est appliquée sur un colis non retiré.',
    category: 'payment',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'days', label: 'Nombre de jours', example: '5' },
      { name: 'dailyRate', label: 'Taux journalier (XAF)', example: '500' },
      { name: 'totalAmount', label: 'Pénalité totale (XAF)', example: '2 500' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Douala Port' },
    ],
    attachments: [],
  },
  {
    kind: 'STORAGE_CHARGE_STARTED',
    label: 'Début des frais de magasinage',
    description: 'Déclenché quand la période de grâce est écoulée et que les frais commencent à courir.',
    category: 'payment',
    recipient: 'client',
    variables: [
      { name: 'trackingNumber', label: 'Numéro de suivi', example: 'OPT-2024-00142' },
      { name: 'designation', label: 'Désignation du colis', example: 'Vêtements + chaussures' },
      { name: 'phase', label: 'Phase (DEPARTURE/DESTINATION)', example: 'DESTINATION' },
      { name: 'freeDays', label: 'Jours gratuits accordés', example: '3' },
      { name: 'dailyRate', label: 'Taux journalier (XAF)', example: '500' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
    ],
    attachments: [],
  },

  // ── FACTURES ─────────────────────────────────────────────────────────────
  {
    kind: 'INVOICE_CREATED',
    label: 'Nouvelle facture créée',
    description: 'Déclenché à la création d\'une facture client.',
    category: 'invoice',
    recipient: 'client',
    variables: [
      { name: 'reference', label: 'Référence facture', example: 'FAC-2024-0089' },
      { name: 'totalAmount', label: 'Montant total (XAF)', example: '45 000' },
      { name: 'currency', label: 'Devise', example: 'XAF' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'agencyName', label: 'Nom de l\'agence', example: 'Agence Yaoundé Centre' },
      { name: 'invoiceUrl', label: 'Lien vers la facture', example: 'https://app.exemple.com/invoices' },
    ],
    attachments: [
      { key: 'invoice', label: 'Facture (PDF)', description: 'PDF de la facture générée.' },
    ],
  },
  {
    kind: 'INVOICE_PAID',
    label: 'Facture entièrement réglée',
    description: 'Déclenché quand la totalité d\'une facture est réglée.',
    category: 'invoice',
    recipient: 'client',
    variables: [
      { name: 'reference', label: 'Référence facture', example: 'FAC-2024-0089' },
      { name: 'totalAmount', label: 'Montant total réglé (XAF)', example: '45 000' },
      { name: 'currency', label: 'Devise', example: 'XAF' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'invoiceUrl', label: 'Lien vers la facture', example: 'https://app.exemple.com/invoices' },
    ],
    attachments: [
      { key: 'invoice', label: 'Facture réglée (PDF)', description: 'PDF de la facture marquée comme réglée.' },
    ],
  },
  {
    kind: 'INVOICE_UPDATED',
    label: 'Facture mise à jour',
    description: 'Déclenché quand une facture existante est modifiée (ajustement de montant, lignes ajoutées).',
    category: 'invoice',
    recipient: 'client',
    variables: [
      { name: 'reference', label: 'Référence facture', example: 'FAC-2024-0089' },
      { name: 'totalAmount', label: 'Nouveau montant total (XAF)', example: '52 000' },
      { name: 'currency', label: 'Devise', example: 'XAF' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'invoiceUrl', label: 'Lien vers la facture', example: 'https://app.exemple.com/invoices' },
    ],
    attachments: [
      { key: 'invoice', label: 'Facture mise à jour (PDF)', description: 'PDF de la facture avec les nouveaux montants.' },
    ],
  },

  // ── FIDÉLITÉ ─────────────────────────────────────────────────────────────
  {
    kind: 'CLIENT_LOYALTY_UPDATED',
    label: 'Points de fidélité mis à jour',
    description: 'Déclenché à chaque crédit ou débit de points de fidélité client.',
    category: 'loyalty',
    recipient: 'client',
    variables: [
      { name: 'points', label: 'Solde total de points', example: '1 250' },
      { name: 'delta', label: 'Variation (+ ou -)', example: '+50' },
      { name: 'reason', label: 'Motif de la variation', example: 'Envoi colis OPT-2024-00142' },
      { name: 'clientName', label: 'Nom du client', example: 'Jean Dupont' },
      { name: 'loyaltyUrl', label: 'Lien espace fidélité', example: 'https://app.exemple.com/loyalty' },
    ],
    attachments: [],
  },

  // ── CONTENEURS (admin) ───────────────────────────────────────────────────
  {
    kind: 'CONTAINER_DEPARTED',
    label: 'Conteneur parti',
    description: 'Déclenché au départ d\'un conteneur. Notifié aux admins de l\'agence de départ.',
    category: 'container',
    recipient: 'admin',
    variables: [
      { name: 'containerName', label: 'Nom du conteneur', example: 'CTN-Yaoundé-012' },
      { name: 'parcelCount', label: 'Nombre de colis embarqués', example: '47' },
      { name: 'agencyName', label: 'Agence de départ', example: 'Agence Yaoundé Centre' },
    ],
    attachments: [],
  },
  {
    kind: 'CONTAINER_ARRIVED',
    label: 'Conteneur arrivé',
    description: 'Déclenché à l\'arrivée d\'un conteneur. Notifié aux admins de l\'agence de destination.',
    category: 'container',
    recipient: 'admin',
    variables: [
      { name: 'containerName', label: 'Nom du conteneur', example: 'CTN-Yaoundé-012' },
      { name: 'parcelCount', label: 'Nombre de colis à décharger', example: '45' },
      { name: 'agencyName', label: 'Agence d\'arrivée', example: 'Agence Douala Port' },
    ],
    attachments: [],
  },
];

/** Map indexé par eventKind pour lookup O(1). */
export const NOTIFICATION_EVENT_MAP = new Map<string, NotificationEventDefinition>(
  NOTIFICATION_EVENT_REGISTRY.map((e) => [e.kind, e]),
);

/** Tous les kinds disponibles. */
export const NOTIFICATION_EVENT_KINDS = NOTIFICATION_EVENT_REGISTRY.map((e) => e.kind);

export type NotificationEventKind = (typeof NOTIFICATION_EVENT_KINDS)[number];
