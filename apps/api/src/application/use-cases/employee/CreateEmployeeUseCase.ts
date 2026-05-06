import { inject, injectable } from 'tsyringe';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { EMPLOYEE_REPOSITORY, type IEmployeeRepository } from '../../interfaces/IEmployeeRepository';
import { PayrollChargeService } from '../../services/PayrollChargeService';
import { prisma } from '../../../config/database';
import { BusinessError } from '../../../domain/errors/BusinessError';

interface CreateEmployeeInput {
  agencyId: string;
  fullName: string;
  idNumber?: string;
  phone?: string;
  email?: string;
  position: string;
  level?: string;
  baseSalary?: number;
  educationLevel?: string;
  specialty?: string;
  contractType?: 'STAGIAIRE' | 'CDD' | 'CDI' | 'PRESTATAIRE';
  managerId?: string;
  isAgencyManager?: boolean;
  /** Si true, on cree un User lie pour permettre la connexion portail. */
  createUser?: boolean;
}

function generateInitialPassword(): string {
  // 10 caracteres aleatoires lisibles (pas de 0/O/1/I confus).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += alphabet[bytes[i] % alphabet.length];
  return pwd;
}

@injectable()
export class CreateEmployeeUseCase {
  constructor(
    @inject(EMPLOYEE_REPOSITORY) private employeeRepo: IEmployeeRepository,
    private payrollCharge: PayrollChargeService,
  ) {}

  async execute(input: CreateEmployeeInput, organizationId?: string) {
    // 1) Cree d'abord l'employe
    const employee = await this.employeeRepo.create({
      fullName: input.fullName,
      idNumber: input.idNumber ?? null,
      phone: input.phone ?? null,
      position: input.position,
      level: input.level ?? null,
      baseSalary: input.baseSalary ?? 0,
      educationLevel: input.educationLevel ?? null,
      specialty: input.specialty ?? null,
      contractType: (input.contractType as any) ?? 'CDI',
      isAgencyManager: !!input.isAgencyManager,
      ...(input.managerId && { manager: { connect: { id: input.managerId } } }),
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
      }
    }

    // 3) Sync masse salariale (auto-managee)
    await this.payrollCharge.syncForAgency(input.agencyId);

    return { ...employee, initialPassword };
  }
}
