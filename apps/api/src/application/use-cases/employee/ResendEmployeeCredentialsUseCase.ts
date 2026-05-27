import { injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../../../config/database';
import { BusinessError, NotFoundError } from '../../../domain/errors/BusinessError';
import { emailService } from '../../../infrastructure/email/EmailService';

function generatePassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += alphabet[bytes[i] % alphabet.length];
  return pwd;
}

interface Options {
  /** Si true, genere un nouveau mot de passe et le persiste. Defaut true. */
  resetPassword?: boolean;
}

/**
 * (Re)envoie les identifiants portail a un employe par email. Genere un
 * nouveau mot de passe par defaut (mode "reset"). Si l'employe n'a pas
 * encore de compte User, en cree un automatiquement (email requis).
 */
@injectable()
export class ResendEmployeeCredentialsUseCase {
  async execute(employeeId: string, organizationId: string, options: Options = {}) {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true, agency: { select: { id: true } } },
    });
    if (!employee) throw new NotFoundError('Employe', employeeId);

    // Resout l'email cible : User.email > Employee.client.email > fallback.
    let email: string | null = employee.user?.email ?? null;
    if (!email && employee.clientId) {
      const c = await prisma.client.findUnique({ where: { id: employee.clientId }, select: { email: true } });
      email = c?.email ?? null;
    }
    if (!email) {
      throw new BusinessError(
        "Aucun email associe a cet employe. Renseignez un email sur sa fiche d'abord.",
      );
    }

    const resetPassword = options.resetPassword !== false;
    let plainPassword: string | null = null;

    if (employee.user) {
      // Mode reset : nouveau password + persist
      if (resetPassword) {
        plainPassword = generatePassword();
        const hash = await bcrypt.hash(plainPassword, 10);
        await prisma.user.update({
          where: { id: employee.user.id },
          data: { passwordHash: hash },
        });
      }
    } else {
      // Pas de User : on en cree un (cas employe cree sans createUser).
      const [firstName, ...rest] = employee.fullName.trim().split(/\s+/);
      const lastName = rest.join(' ') || firstName;
      plainPassword = generatePassword();
      const hash = await bcrypt.hash(plainPassword, 10);
      const role = employee.isAgencyManager ? 'CHEF_AGENCE' : 'PERSONNEL';
      const created = await prisma.user.create({
        data: {
          organizationId,
          email,
          passwordHash: hash,
          firstName,
          lastName,
          phone: employee.phone,
          role: role as any,
          isActive: true,
          isVerified: false,
        },
      });
      await prisma.employee.update({
        where: { id: employee.id },
        data: { userId: created.id },
      });
      await prisma.userAgency.create({
        data: { userId: created.id, agencyId: employee.agencyId },
      });
    }

    if (!plainPassword) {
      // Mode no-reset sur compte existant : on ne peut pas re-envoyer le
      // mot de passe (stocke en hash). On bascule force-reset.
      plainPassword = generatePassword();
      const hash = await bcrypt.hash(plainPassword, 10);
      await prisma.user.update({
        where: { id: employee.user!.id },
        data: { passwordHash: hash },
      });
    }

    await emailService.sendEmployeePortalCredentials(
      email,
      employee.fullName,
      email,
      plainPassword,
      organizationId,
    );

    return { ok: true, email, passwordReset: true };
  }
}
