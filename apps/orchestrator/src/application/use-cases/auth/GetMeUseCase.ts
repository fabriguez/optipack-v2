import { injectable } from 'tsyringe';
import { prisma } from '../../../config/database';
import { AuthenticationError } from '../../../domain/errors/BusinessError';

@injectable()
export class GetMeUseCase {
  async execute(opsAdminId: string) {
    const admin = await prisma.opsAdmin.findUnique({
      where: { id: opsAdminId },
      include: { tenant: { select: { id: true, slug: true, name: true } } },
    });
    if (!admin) throw new AuthenticationError('Utilisateur introuvable');
    return {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName,
      isSuperAdmin: admin.isSuperAdmin,
      isActive: admin.isActive,
      twoFactorEnabled: admin.twoFactorEnabled,
      lastLoginAt: admin.lastLoginAt,
      createdAt: admin.createdAt,
      // Scope tenant : null pour un ops global. L'UI s'en sert pour basculer en
      // mode "portail facturation" (vue restreinte + redirection).
      tenantId: admin.tenantId,
      tenant: admin.tenant,
    };
  }
}
