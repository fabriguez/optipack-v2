import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { EMPLOYEE_REPOSITORY, type IEmployeeRepository } from '../../interfaces/IEmployeeRepository';
import { PayrollChargeService } from '../../services/PayrollChargeService';
import { prisma } from '../../../config/database';
import { BusinessError } from '../../../domain/errors/BusinessError';
import { emailService } from '../../../infrastructure/email/EmailService';
import { provisionClientPortalAccess } from '../../services/ClientPortalAccessService';

interface CreateEmployeeInput {
  agencyId: string;
  fullName: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  /** Libelle du poste (legacy). Conserve pour compat. */
  position: string;
  /** FK vers Position (Phase 1 RH/ABAC). Recommande pour tous les nouveaux Employee. */
  positionId?: string;
  level?: string;
  baseSalary?: number;
  educationLevel?: string;
  specialty?: string;
  contractType?: 'STAGIAIRE' | 'CDD' | 'CDI' | 'PRESTATAIRE';
  managerId?: string;
  isAgencyManager?: boolean;
  /** Si true, on cree un User lie pour permettre la connexion portail. */
  createUser?: boolean;
  /** Si true (defaut), cree ou lie un profil Client (un personnel = potentiel client). */
  syncClient?: boolean;
  /** Contact d'urgence optionnel. */
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
}

function generateInitialPassword(): string {
  // 10 caracteres aleatoires lisibles (pas de 0/O/1/I confus).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += alphabet[bytes[i] % alphabet.length];
  return pwd;
}

/**
 * Genere le matricule employe au format [PREFIX]-EMPL-XXXX, ou PREFIX est
 * la premiere syllabe du nom du tenant (3 lettres). Suffixe : YYMMDDHHmm
 * pour garantir un quasi-unique sans collision lecteur.
 *
 * Exemple : tenant "TransitSoftServices" -> "TRA-EMPL-2511231342".
 */
function generateEmployeeMatricule(tenantName: string | null | undefined): string {
  const cleaned = (tenantName ?? 'ORG').replace(/[^A-Za-z0-9]/g, '');
  const prefix = (cleaned.slice(0, 3) || 'ORG').toUpperCase();
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mn = String(now.getMinutes()).padStart(2, '0');
  return `${prefix}-EMPL-${yy}${mm}${dd}${hh}${mn}`;
}

@injectable()
export class CreateEmployeeUseCase {
  constructor(
    @inject(EMPLOYEE_REPOSITORY) private employeeRepo: IEmployeeRepository,
    private payrollCharge: PayrollChargeService,
  ) {}

  async execute(input: CreateEmployeeInput, organizationId?: string) {
    // Un employe est AUSSI un client : on cree systematiquement sa fiche client
    // (sauf syncClient=false explicite). Comme Client.phone est obligatoire et
    // unique, le telephone devient requis pour creer un employe.
    const shouldSyncClient = input.syncClient !== false;
    if (shouldSyncClient && !input.phone) {
      throw new BusinessError(
        'Le telephone est obligatoire : un employe est aussi un client, sa fiche est creee automatiquement.',
      );
    }

    // 0) Invariant chef unique : si on cree un nouveau chef, demote tout
    //    autre chef actif de l'agence (flag + role User si CHEF_AGENCE).
    if (input.isAgencyManager) {
      const others = await prisma.employee.findMany({
        where: { agencyId: input.agencyId, isAgencyManager: true },
        include: { user: true },
      });
      if (others.length > 0) {
        await prisma.$transaction(async (tx) => {
          await tx.employee.updateMany({
            where: { id: { in: others.map((o) => o.id) } },
            data: { isAgencyManager: false },
          });
          const userIds = others
            .filter((o) => o.user && o.user.role === 'CHEF_AGENCE')
            .map((o) => o.user!.id);
          if (userIds.length > 0) {
            await tx.user.updateMany({
              where: { id: { in: userIds } },
              data: { role: 'PERSONNEL' as any },
            });
          }
        });
      }
    }

    // 1) Cree d'abord l'employe. Matricule : auto-genere a partir du tenant
    //    si non fourni. Format [PREFIX_TENANT]-EMPL-YYMMDDHHmm.
    let matricule = input.idNumber?.trim() || null;
    if (!matricule) {
      let tenantName: string | null = null;
      if (organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: organizationId },
          select: { name: true },
        });
        tenantName = org?.name ?? null;
      }
      matricule = generateEmployeeMatricule(tenantName);
    }

    const employee = await this.employeeRepo.create({
      fullName: input.fullName,
      idNumber: matricule,
      phone: input.phone ?? null,
      position: input.position,
      level: input.level ?? null,
      baseSalary: input.baseSalary ?? 0,
      educationLevel: input.educationLevel ?? null,
      specialty: input.specialty ?? null,
      contractType: (input.contractType as any) ?? 'CDI',
      emergencyContactName: input.emergencyContactName?.trim() || null,
      emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
      emergencyContactRelation: input.emergencyContactRelation?.trim() || null,
      isAgencyManager: !!input.isAgencyManager,
      ...(input.managerId && { manager: { connect: { id: input.managerId } } }),
      ...(input.positionId && { positionRef: { connect: { id: input.positionId } } }),
      agency: { connect: { id: input.agencyId } },
    } as any);

    // 2) Optionnel : creation User pour le portail self-service
    let initialPassword: string | undefined;
    if (input.createUser) {
      if (!input.email) {
        throw new BusinessError(
          'Email obligatoire pour creer un compte utilisateur (connexion au portail).',
        );
      }
      // Si User existe deja, on le rattache
      const existing = await prisma.user.findUnique({ where: { email: input.email } });
      if (existing) {
        await prisma.employee.update({
          where: { id: employee.id },
          data: { userId: existing.id },
        });
      } else {
        // Splitter approximatif fullName -> firstName/lastName
        const [firstName, ...rest] = input.fullName.trim().split(/\s+/);
        const lastName = rest.join(' ') || firstName;
        initialPassword = generateInitialPassword();
        const passwordHash = await bcrypt.hash(initialPassword, 10);
        const role = input.isAgencyManager ? 'CHEF_AGENCE' : 'PERSONNEL';
        const user = await prisma.user.create({
          data: {
            organizationId: organizationId ?? '',
            email: input.email,
            passwordHash,
            firstName,
            lastName,
            phone: input.phone ?? null,
            role: role as any,
            isActive: true,
            isVerified: false,
          },
        });
        // Lie User <-> Employee + ajoute UserAgency pour acces a l'agence
        await prisma.employee.update({
          where: { id: employee.id },
          data: { userId: user.id },
        });
        await prisma.userAgency.create({
          data: { userId: user.id, agencyId: input.agencyId },
        });
        // Envoi email best-effort des identifiants (le mot de passe reste aussi
        // affiche a l'admin via initialPassword pour fallback).
        emailService
          .sendEmployeePortalCredentials(input.email, input.fullName, input.email, initialPassword, organizationId ?? null)
          .catch(() => {});
      }
    }

    // 3) Sync Personnel <-> Client (Phase 1 RH).
    // Un personnel est un potentiel client : on lui cree (ou lie) un profil
    // Client pour l'inclure dans la base commerciale et eviter les doublons.
    // Desactivable via syncClient=false (cas tests / imports historiques).
    if (shouldSyncClient && organizationId && input.phone) {
      try {
        // Cherche par telephone (Client.phone est unique)
        const existingClient = await prisma.client.findUnique({
          where: { phone: input.phone },
        });
        // Email : on ne le pose sur la fiche que s'il n'appartient pas deja a
        // un AUTRE client (Client.email est unique). Sinon on cree la fiche
        // sans email pour garantir la creation du client (phone reste la cle).
        let clientEmail: string | null = input.email ?? null;
        if (clientEmail) {
          const emailOwner = await prisma.client.findUnique({
            where: { email: clientEmail },
            select: { id: true },
          });
          if (emailOwner && emailOwner.id !== existingClient?.id) {
            clientEmail = null;
          }
        }
        const client = existingClient
          ? existingClient
          : await prisma.client.create({
              data: {
                organizationId,
                agencyId: input.agencyId,
                fullName: input.fullName,
                phone: input.phone,
                email: clientEmail,
                idNumber: input.idNumber ?? null,
                clientType: 'INDIVIDUAL',
                isActive: true,
                organization: { connect: { id: organizationId } },
              } as any,
            });
        await prisma.employee.update({
          where: { id: employee.id },
          data: { clientId: client.id },
        });
        // Un employe est aussi un client : on lui provisionne son acces au
        // portail client (web/mobile) et on lui envoie ses identifiants par
        // mail, en plus de ses acces backoffice (User) ci-dessus. No-op si le
        // client a deja un portail actif ou n'a pas d'email.
        await provisionClientPortalAccess({
          clientId: client.id,
          fullName: client.fullName,
          phone: client.phone,
          email: client.email ?? input.email ?? null,
          isPortalActive: (client as { isPortalActive?: boolean }).isPortalActive ?? false,
          organizationId,
        });
      } catch (err) {
        // On n'echoue pas la creation Employee si la sync Client echoue
        // (ex: contrainte unique sur le telephone). On log seulement.
        // eslint-disable-next-line no-console
        console.warn('[CreateEmployee] Sync Client echouee:', (err as Error).message);
      }
    }

    // 4) Sync masse salariale (auto-managee)
    await this.payrollCharge.syncForAgency(input.agencyId);

    return { ...employee, initialPassword };
  }
}
