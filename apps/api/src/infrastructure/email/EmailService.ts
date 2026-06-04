import { config } from '../../config';
import { prisma } from '../../config/database';
import { tenantEmailDispatcher } from './TenantEmailDispatcher';
import {
  emailLayout,
  heading,
  paragraph,
  highlightBlock,
  infoTable,
  infoRow,
  divider,
  actionButton,
} from './emailLayout';

// Cache branding tenant pour eviter un SELECT a chaque envoi mail.
// Invalide via emailService.invalidateBranding(orgId) au PATCH branding/skin.
const brandingCache = new Map<string, { logoUrl: string | null; name: string | null }>();

async function getBranding(organizationId?: string | null) {
  if (!organizationId) return undefined;
  const cached = brandingCache.get(organizationId);
  if (cached) return cached;
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { logoUrl: true, name: true },
  });
  if (org) {
    brandingCache.set(organizationId, { logoUrl: org.logoUrl, name: org.name });
    return { logoUrl: org.logoUrl, name: org.name };
  }
  return undefined;
}

/**
 * Templates email + envoi route via TenantEmailDispatcher.
 *
 * Toutes les methodes acceptent un organizationId optionnel : si fourni, le
 * dispatcher choisit le provider du tenant (Resend dedie), sinon il prend la
 * cascade partagee (Resend env -> SMTP).
 *
 * NB : on conserve l'API des sendXxx() pour ne pas casser les appelants
 * existants, mais le routing reseau passe maintenant toujours par le
 * dispatcher (plus de nodemailer direct ici).
 */
class EmailService {
  /**
   * Envoi generique. bodyContent est insere dans emailLayout (header/footer).
   * Si l'appelant passe deja un HTML complet (<html>...</html>), il doit
   * appeler tenantEmailDispatcher.sendForTenant directement.
   */
  async send(
    to: string,
    subject: string,
    bodyContent: string,
    organizationId?: string | null,
    options?: { event?: string },
  ): Promise<boolean> {
    // Branding tenant : logo + nom dans header/footer du mail. Sans
    // organizationId, on garde le wording generique TransitSoftServices.
    const branding = await getBranding(organizationId);
    const orgName = branding?.name?.trim() || 'TransitSoftServices';
    const result = await tenantEmailDispatcher.sendForTenant(
      organizationId ?? null,
      {
        to,
        subject: `${orgName} - ${subject}`,
        html: emailLayout(bodyContent, branding),
      },
      { event: options?.event },
    );
    return result.ok;
  }

  /** Invalide le cache branding (apres modif logoUrl/name d'un tenant). */
  invalidateBranding(organizationId: string): void {
    brandingCache.delete(organizationId);
  }

  async sendParcelCreated(
    to: string,
    trackingNumber: string,
    designation: string,
    destination: string,
    weight: string | number | null | undefined,
    price: string,
    organizationId?: string | null,
    options?: { volume?: string | number | null; transitType?: 'AIR' | 'SEA' | 'LAND' | string | null },
  ) {
    // Choix de l'unite affichee selon le type de route :
    //  - SEA  -> volume uniquement (m3)
    //  - AIR  -> masse uniquement (kg)
    //  - LAND -> les deux si renseignes
    const type = options?.transitType;
    const w = weight != null && Number(weight) > 0 ? Number(weight) : null;
    const v = options?.volume != null && Number(options.volume) > 0 ? Number(options.volume) : null;
    const quantityRows: string[] = [];
    if (type === 'SEA') {
      if (v != null) quantityRows.push(infoRow('Volume', `${v} m³`));
    } else if (type === 'AIR') {
      if (w != null) quantityRows.push(infoRow('Masse', `${w} kg`));
    } else {
      // LAND ou type inconnu : on affiche tout ce qui est dispo.
      if (w != null) quantityRows.push(infoRow('Masse', `${w} kg`));
      if (v != null) quantityRows.push(infoRow('Volume', `${v} m³`));
    }
    // Fallback ultime si rien : on n'affiche pas de ligne vide -- on a deja
    // tracking + designation + destination + prix.

    const content = [
      heading('Colis enregistre'),
      paragraph(`Votre colis <strong>${designation || 'sans designation'}</strong> a ete enregistre avec succes dans notre systeme.`),
      highlightBlock('Numero de suivi', trackingNumber),
      infoTable(
        infoRow('Designation', designation || '-') +
        infoRow('Destination', destination || '-') +
        quantityRows.join('') +
        infoRow('Prix', price),
      ),
      divider(),
      paragraph('Conservez votre numero de suivi pour suivre votre colis a tout moment.'),
      actionButton('Suivre mon colis', `${config.webUrl}/tracking/${trackingNumber}`),
    ].join('');
    return this.send(to, `Colis enregistre - ${trackingNumber}`, content, organizationId, { event: 'PARCEL_CREATED' });
  }

  async sendParcelStatusChanged(
    to: string,
    trackingNumber: string,
    designation: string,
    newStatus: string,
    organizationId?: string | null,
  ) {
    const statusLabels: Record<string, string> = {
      IN_STOCK: 'En stock',
      LOADING: 'En cours de chargement',
      IN_TRANSIT: 'En transit',
      ARRIVED: 'Arrive a destination',
      RECEIVED: 'Receptionne',
      DELIVERED: 'Livre',
    };
    const label = statusLabels[newStatus] || newStatus;
    const isDelivered = newStatus === 'DELIVERED';

    const content = [
      heading('Mise a jour de votre colis'),
      paragraph(`Le statut de votre colis <strong>${designation}</strong> a ete mis a jour.`),
      highlightBlock('Statut actuel', label),
      infoTable(
        infoRow('Numero de suivi', trackingNumber) +
        infoRow('Designation', designation) +
        infoRow('Nouveau statut', label),
      ),
      divider(),
      isDelivered
        ? paragraph('Votre colis a ete livre. Merci pour votre confiance.')
        : paragraph('Vous pouvez suivre votre colis en temps reel.'),
      actionButton('Voir les details', `${config.webUrl}/tracking/${trackingNumber}`),
    ].join('');

    return this.send(to, `Colis ${label.toLowerCase()} - ${trackingNumber}`, content, organizationId, { event: `PARCEL_${newStatus}` });
  }

  /** Colis charge dans un conteneur. */
  async sendParcelLoaded(
    to: string,
    trackingNumber: string,
    designation: string,
    containerName: string,
    organizationId?: string | null,
  ) {
    const content = [
      heading('Colis charge'),
      paragraph(`Votre colis <strong>${designation}</strong> vient d'etre charge dans le conteneur <strong>${containerName}</strong>.`),
      highlightBlock('Etape', 'Chargement'),
      infoTable(
        infoRow('Numero de suivi', trackingNumber) +
        infoRow('Designation', designation) +
        infoRow('Conteneur', containerName),
      ),
      divider(),
      paragraph('Le depart du conteneur sera notifie sous peu.'),
      actionButton('Suivre mon colis', `${config.webUrl}/tracking/${trackingNumber}`),
    ].join('');
    return this.send(to, `Colis charge - ${trackingNumber}`, content, organizationId, { event: 'PARCEL_LOADED' });
  }

  /** Colis decharge / receptionne a destination. */
  async sendParcelUnloaded(
    to: string,
    trackingNumber: string,
    designation: string,
    action: 'received' | 'not_found' | 'modified',
    agencyName: string,
    organizationId?: string | null,
  ) {
    const labels = {
      received: { title: 'Colis decharge', highlight: 'Disponible en magasin' },
      not_found: { title: 'Colis non retrouve', highlight: 'Recherche en cours' },
      modified: { title: 'Colis mis a jour', highlight: 'Modification au dechargement' },
    } as const;
    const { title, highlight } = labels[action];

    const content = [
      heading(title),
      paragraph(`Votre colis <strong>${designation}</strong> (${trackingNumber}) a ete traite a l'agence <strong>${agencyName}</strong>.`),
      highlightBlock('Statut', highlight, action === 'not_found' ? 'warning' : 'success'),
      infoTable(
        infoRow('Numero de suivi', trackingNumber) +
        infoRow('Designation', designation) +
        infoRow('Agence', agencyName),
      ),
      divider(),
      paragraph(action === 'received'
        ? 'Votre colis est disponible et peut etre retire aux heures d\'ouverture.'
        : action === 'not_found'
        ? 'Notre equipe enquete et vous tiendra informe.'
        : 'Consultez votre espace pour voir les modifications.'),
      actionButton('Voir mon colis', `${config.webUrl}/tracking/${trackingNumber}`),
    ].join('');
    return this.send(to, `${title} - ${trackingNumber}`, content, organizationId, { event: `PARCEL_${action.toUpperCase()}` });
  }

  /** Retrait du colis par le client. */
  async sendParcelWithdrawn(
    to: string,
    trackingNumber: string,
    designation: string,
    agencyName: string,
    organizationId?: string | null,
  ) {
    const content = [
      heading('Colis retire'),
      paragraph(`Votre colis <strong>${designation}</strong> a bien ete retire a l'agence <strong>${agencyName}</strong>.`),
      highlightBlock('Etape', 'Livraison finalisee'),
      infoTable(
        infoRow('Numero de suivi', trackingNumber) +
        infoRow('Designation', designation) +
        infoRow('Agence de retrait', agencyName),
      ),
      divider(),
      paragraph('Merci de votre confiance. A bientot.'),
    ].join('');
    return this.send(to, `Colis retire - ${trackingNumber}`, content, organizationId, { event: 'PARCEL_WITHDRAWN' });
  }

  /** Facture creee pour un colis. */
  async sendInvoiceCreated(
    to: string,
    reference: string,
    totalAmount: string,
    currency: string,
    organizationId?: string | null,
  ) {
    const content = [
      heading('Nouvelle facture'),
      paragraph(`Une facture vient d'etre emise. Reference : <strong>${reference}</strong>.`),
      highlightBlock('Montant total', `${totalAmount} ${currency}`),
      infoTable(
        infoRow('Reference', reference) +
        infoRow('Montant', `${totalAmount} ${currency}`),
      ),
      divider(),
      paragraph('Vous pouvez la consulter et la regler depuis votre espace client.'),
      actionButton('Voir ma facture', `${config.webUrl}/invoices`),
    ].join('');
    return this.send(to, `Facture ${reference}`, content, organizationId, { event: 'INVOICE_CREATED' });
  }

  /** Mise a jour de la facture (modification colis, ajustement). */
  async sendInvoiceUpdated(
    to: string,
    reference: string,
    newTotal: string,
    currency: string,
    reason: string,
    organizationId?: string | null,
  ) {
    const content = [
      heading('Facture mise a jour'),
      paragraph(`La facture <strong>${reference}</strong> a ete mise a jour.`),
      highlightBlock('Nouveau total', `${newTotal} ${currency}`),
      infoTable(
        infoRow('Reference', reference) +
        infoRow('Motif', reason) +
        infoRow('Nouveau total', `${newTotal} ${currency}`),
      ),
      divider(),
      paragraph('Pensez a verifier les details de l\'ajustement.'),
      actionButton('Consulter', `${config.webUrl}/invoices`),
    ].join('');
    return this.send(to, `Facture mise a jour ${reference}`, content, organizationId, { event: 'INVOICE_UPDATED' });
  }

  async sendPaymentReceived(
    to: string,
    amount: string,
    invoiceRef: string,
    agencyName: string,
    paymentMethod: string,
    remainingBalance: string,
    organizationId?: string | null,
  ) {
    const methodLabels: Record<string, string> = {
      CASH: 'Especes',
      MOBILE_MONEY: 'Mobile Money',
      BANK_TRANSFER: 'Virement bancaire',
      CARD: 'Carte bancaire',
      CHECK: 'Cheque',
    };

    const content = [
      heading('Paiement recu'),
      paragraph('Nous avons bien recu votre paiement. Voici les details :'),
      highlightBlock('Montant paye', amount),
      infoTable(
        infoRow('Facture', invoiceRef) +
        infoRow('Mode de paiement', methodLabels[paymentMethod] || paymentMethod) +
        infoRow('Agence encaisseuse', agencyName) +
        infoRow('Solde restant', remainingBalance),
      ),
      divider(),
      paragraph('Merci pour votre paiement.'),
    ].join('');

    return this.send(to, `Paiement recu - ${invoiceRef}`, content, organizationId, { event: 'PAYMENT_RECEIVED' });
  }

  async sendPenaltyAlert(
    to: string,
    trackingNumber: string,
    designation: string,
    days: number,
    dailyRate: string,
    totalAmount: string,
    agencyName: string,
    organizationId?: string | null,
  ) {
    const content = [
      heading('Penalite de stockage'),
      paragraph(
        `Votre colis <strong>${designation}</strong> est en attente a l'agence <strong>${agencyName}</strong> ` +
        `depuis <strong>${days} jours</strong>. Des frais de stockage sont appliques au-dela de 10 jours.`,
      ),
      highlightBlock('Penalite accumulee', totalAmount, 'warning'),
      infoTable(
        infoRow('Numero de suivi', trackingNumber) +
        infoRow('Designation', designation) +
        infoRow('Jours en attente', `${days} jours`) +
        infoRow('Taux journalier', dailyRate) +
        infoRow('Agence', agencyName),
      ),
      divider(),
      paragraph('Veuillez recuperer votre colis au plus vite pour eviter des frais supplementaires.'),
      actionButton("Contacter l'agence", `${config.webUrl}/agencies`),
    ].join('');

    return this.send(to, `Penalite de stockage - ${trackingNumber}`, content, organizationId, { event: 'PENALTY_APPLIED' });
  }

  /** Mise a jour des points de fidelite. */
  async sendLoyaltyPointsUpdated(
    to: string,
    delta: number,
    newBalance: number,
    reason: string,
    organizationId?: string | null,
  ) {
    const positive = delta >= 0;
    const content = [
      heading('Points de fidelite mis a jour'),
      paragraph(`Vos points de fidelite viennent d'etre ${positive ? 'credites' : 'debites'}.`),
      highlightBlock(positive ? 'Points gagnes' : 'Points debites', `${positive ? '+' : ''}${delta} pts`, positive ? 'success' : 'warning'),
      infoTable(
        infoRow('Nouveau solde', `${newBalance} pts`) +
        infoRow('Variation', `${positive ? '+' : ''}${delta} pts`) +
        infoRow('Motif', reason || '-'),
      ),
      divider(),
      paragraph('Cumulez des points a chaque envoi et utilisez-les pour vos prochains colis.'),
      actionButton('Voir mon solde', `${config.webUrl}/loyalty`),
    ].join('');
    return this.send(to, `Points fidelite : ${positive ? '+' : ''}${delta}`, content, organizationId, { event: 'LOYALTY_UPDATED' });
  }

  async sendDebtReminder(
    to: string,
    clientName: string,
    totalDebt: string,
    nextDueDate: string,
    nextAmount: string,
    organizationId?: string | null,
  ) {
    const content = [
      heading('Rappel de dette'),
      paragraph(`Bonjour <strong>${clientName}</strong>, ceci est un rappel concernant votre solde en cours.`),
      highlightBlock('Montant restant', totalDebt, 'warning'),
      infoTable(
        infoRow("Prochaine echeance", nextDueDate) +
        infoRow("Montant de l'echeance", nextAmount),
      ),
      divider(),
      paragraph("Merci de regulariser votre situation avant la date d'echeance."),
    ].join('');

    return this.send(to, `Rappel de dette - ${clientName}`, content, organizationId, { event: 'DEBT_REMINDER' });
  }

  /**
   * Envoie les identifiants initiaux de connexion au portail employe.
   * Le mot de passe est en clair dans le mail (one-shot) et l'employe doit
   * idealement le changer apres premiere connexion.
   */
  async sendEmployeePortalCredentials(
    to: string,
    employeeName: string,
    email: string,
    password: string,
    organizationId?: string | null,
    phone?: string | null,
  ) {
    const idLines: string[] = [];
    if (email) idLines.push(`Email : <strong>${email}</strong>`);
    if (phone) idLines.push(`Telephone : <strong>${phone}</strong>`);
    idLines.push(`Mot de passe : <strong>${password}</strong>`);
    const content = [
      heading('Votre compte portail TransitSoftServices'),
      paragraph(
        `Bonjour <strong>${employeeName}</strong>, votre compte personnel a ete cree. ` +
        'Vous pouvez desormais vous connecter au portail pour consulter votre profil, ' +
        'demander des conges et voir vos bulletins.',
      ),
      highlightBlock(
        'Identifiants',
        `${idLines.join('<br/>')}<br/><span style="color:#666">Connectez-vous avec votre email <em>ou</em> votre telephone.</span>`,
      ),
      divider(),
      paragraph(
        'Pour des raisons de securite, changez votre mot de passe apres votre premiere ' +
        'connexion via la rubrique "Mon compte".',
      ),
      actionButton('Se connecter', `${config.webUrl}/login`),
    ].join('');
    return this.send(to, 'Vos identifiants TransitSoftServices', content, organizationId, { event: 'EMPLOYEE_CREDENTIALS' });
  }

  /**
   * Envoie les identifiants initiaux de connexion au PORTAIL CLIENT (web/mobile).
   * La connexion client se fait par numero de telephone + mot de passe.
   * Mot de passe en clair (one-shot), a changer apres premiere connexion.
   */
  async sendClientPortalCredentials(
    to: string,
    clientName: string,
    loginPhone: string,
    password: string,
    organizationId?: string | null,
    email?: string | null,
  ) {
    const idLines: string[] = [];
    if (loginPhone) idLines.push(`Telephone : <strong>${loginPhone}</strong>`);
    if (email) idLines.push(`Email : <strong>${email}</strong>`);
    idLines.push(`Mot de passe : <strong>${password}</strong>`);
    const content = [
      heading('Votre espace client'),
      paragraph(
        `Bonjour <strong>${clientName}</strong>, votre espace client a ete cree. ` +
        'Vous pouvez suivre vos colis, consulter vos factures et payer en ligne ' +
        'depuis le site web ou l\'application mobile.',
      ),
      highlightBlock(
        'Identifiants de connexion',
        `${idLines.join('<br/>')}<br/><span style="color:#666">Connectez-vous avec votre telephone <em>ou</em> votre email.</span>`,
      ),
      divider(),
      paragraph(
        'Pour votre securite, changez votre mot de passe apres la premiere connexion.',
      ),
      actionButton('Acceder a mon espace', `${config.clientPortalUrl}/login`),
    ].join('');
    return this.send(to, 'Vos acces espace client', content, organizationId, { event: 'CLIENT_CREDENTIALS' });
  }

  /**
   * Envoie un lien de reinitialisation de mot de passe.
   */
  async sendWelcome(to: string, clientName: string, organizationId?: string | null) {
    const content = [
      heading('Bienvenue chez TransitSoftServices'),
      paragraph(
        `Bonjour <strong>${clientName}</strong>, bienvenue dans notre service de transit. ` +
        'Votre compte a ete cree avec succes.',
      ),
      highlightBlock('Votre espace client', 'Actif'),
      divider(),
      paragraph('Vous pouvez desormais suivre vos colis, consulter vos factures et contacter notre support.'),
      actionButton('Acceder a mon espace', config.webUrl),
    ].join('');

    return this.send(to, 'Bienvenue', content, organizationId, { event: 'WELCOME' });
  }
}

export const emailService = new EmailService();
