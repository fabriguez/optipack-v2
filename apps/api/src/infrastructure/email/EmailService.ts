import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from '../../config';
import { createChildLogger } from '../../config/logger';
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

const logger = createChildLogger('EmailService');

class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
    });
  }

  async send(to: string, subject: string, bodyContent: string): Promise<boolean> {
    if (!config.smtp.user || !config.smtp.pass) {
      logger.warn('SMTP non configure, email non envoye');
      return false;
    }

    try {
      await this.transporter.sendMail({
        from: config.smtp.from,
        to,
        subject: `TransitSoftServices - ${subject}`,
        html: emailLayout(bodyContent),
      });
      logger.info({ to, subject }, 'Email envoye');
      return true;
    } catch (err) {
      logger.error({ err, to, subject }, 'Echec envoi email');
      return false;
    }
  }

  async sendParcelCreated(
    to: string,
    trackingNumber: string,
    designation: string,
    destination: string,
    weight: string,
    price: string,
  ) {
    const content = [
      heading('Colis enregistre'),
      paragraph(`Votre colis <strong>${designation}</strong> a ete enregistre avec succes dans notre systeme.`),
      highlightBlock('Numero de suivi', trackingNumber),
      infoTable(
        infoRow('Designation', designation) +
        infoRow('Destination', destination) +
        infoRow('Masse', `${weight} kg`) +
        infoRow('Prix', price),
      ),
      divider(),
      paragraph('Conservez votre numero de suivi pour suivre votre colis a tout moment.'),
      actionButton('Suivre mon colis', `${config.webUrl}/tracking/${trackingNumber}`),
    ].join('');

    return this.send(to, `Colis enregistre - ${trackingNumber}`, content);
  }

  async sendParcelStatusChanged(
    to: string,
    trackingNumber: string,
    designation: string,
    newStatus: string,
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

    return this.send(to, `Colis ${label.toLowerCase()} - ${trackingNumber}`, content);
  }

  async sendPaymentReceived(
    to: string,
    amount: string,
    invoiceRef: string,
    agencyName: string,
    paymentMethod: string,
    remainingBalance: string,
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

    return this.send(to, `Paiement recu - ${invoiceRef}`, content);
  }

  async sendPenaltyAlert(
    to: string,
    trackingNumber: string,
    designation: string,
    days: number,
    dailyRate: string,
    totalAmount: string,
    agencyName: string,
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

    return this.send(to, `Penalite de stockage - ${trackingNumber}`, content);
  }

  async sendDebtReminder(
    to: string,
    clientName: string,
    totalDebt: string,
    nextDueDate: string,
    nextAmount: string,
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

    return this.send(to, `Rappel de dette - ${clientName}`, content);
  }

  async sendWelcome(to: string, clientName: string) {
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

    return this.send(to, 'Bienvenue', content);
  }
}

export const emailService = new EmailService();
