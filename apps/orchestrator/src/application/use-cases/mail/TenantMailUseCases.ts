import { inject, injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { config } from '../../../config';
import { ResendClient } from '../../../infrastructure/resend/ResendClient';
import {
  BusinessError,
  ConflictError,
  NotFoundError,
} from '../../../domain/errors/BusinessError';

@injectable()
export class TenantMailUseCases {
  constructor(@inject(ResendClient) private resend: ResendClient) {}

  /**
   * Lit le record TenantMail (cree si absent).
   * Le getter expose toujours un payload, meme avant provisioning.
   */
  async getOrInit(tenantId: string) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    const existing = await prisma.tenantMail.findUnique({ where: { tenantId } });
    if (existing) return existing;
    return prisma.tenantMail.create({
      data: {
        tenantId,
        sendingDomain: null,
        mailboxQuotaMb: 250,
      },
    });
  }

  /**
   * Provisionne le domaine d'envoi sur Resend pour ce tenant.
   *
   * - Si `customDomain` est fourni, on utilise celui-la (ex: mail.acme.com).
   * - Sinon on construit `<slug>.<baseDomain>` (ex: acme.transitsoftservices.com).
   * - Resend renvoie les records DKIM/SPF/MX a configurer dans le DNS.
   * - On stocke l'ID + le status + les records pour les afficher dans le Studio.
   */
  async provisionDomain(tenantId: string, customDomain?: string) {
    if (!this.resend.isConfigured()) {
      throw new BusinessError(
        'Resend non configure cote orchestrator (RESEND_API_KEY manquant).',
      );
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundError('Tenant', tenantId);

    const sendingDomain =
      customDomain?.trim() || `${tenant.slug}.${config.resend.baseDomain}`;

    // Si on a deja un domaine Resend pour ce tenant avec la meme valeur, on
    // ne recree pas (Resend refuse les doublons de toute facon).
    const existing = await prisma.tenantMail.findUnique({ where: { tenantId } });
    if (existing?.resendDomainId && existing.sendingDomain === sendingDomain) {
      throw new ConflictError(
        `Domaine ${sendingDomain} deja provisionne (id=${existing.resendDomainId}).`,
      );
    }

    const domain = await this.resend.createDomain(sendingDomain);

    return prisma.tenantMail.upsert({
      where: { tenantId },
      create: {
        tenantId,
        sendingDomain,
        resendDomainId: domain.id,
        resendStatus: domain.status,
        resendDnsRecords: domain.records as unknown as object,
      },
      update: {
        sendingDomain,
        resendDomainId: domain.id,
        resendStatus: domain.status,
        resendDnsRecords: domain.records as unknown as object,
      },
    });
  }

  /**
   * Demande a Resend de re-verifier le domaine (l'admin a publie ses DNS records).
   * Met a jour le status + les records (ils contiennent leur statut individuel).
   */
  async verifyDomain(tenantId: string) {
    const mail = await prisma.tenantMail.findUnique({ where: { tenantId } });
    if (!mail?.resendDomainId) {
      throw new BusinessError('Aucun domaine d\'envoi provisionne pour ce tenant.');
    }
    const domain = await this.resend.verifyDomain(mail.resendDomainId);
    return prisma.tenantMail.update({
      where: { tenantId },
      data: {
        resendStatus: domain.status,
        resendDnsRecords: domain.records as unknown as object,
        lastVerifiedAt: new Date(),
      },
    });
  }

  /**
   * Rafraichit l'etat (sans declencher de verification active).
   */
  async refreshStatus(tenantId: string) {
    const mail = await prisma.tenantMail.findUnique({ where: { tenantId } });
    if (!mail?.resendDomainId) {
      return mail ?? this.getOrInit(tenantId);
    }
    const domain = await this.resend.getDomain(mail.resendDomainId);
    return prisma.tenantMail.update({
      where: { tenantId },
      data: {
        resendStatus: domain.status,
        resendDnsRecords: domain.records as unknown as object,
      },
    });
  }
}
