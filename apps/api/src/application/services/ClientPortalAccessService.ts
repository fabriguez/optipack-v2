import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../../config/database';
import { emailService } from '../../infrastructure/email/EmailService';

/** 10 caracteres aleatoires lisibles (pas de 0/O/1/I confus). */
function generatePortalPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let pwd = '';
  for (let i = 0; i < 10; i++) pwd += alphabet[bytes[i] % alphabet.length];
  return pwd;
}

export interface ProvisionPortalResult {
  provisioned: boolean;
  /** Renseigne si provisioned=false : 'no-email' | 'already-active' | 'error'. */
  reason?: string;
}

/**
 * Provisionne l'acces au PORTAIL CLIENT pour un client cree depuis le
 * backoffice (création directe ou sync employe->client) :
 *  - genere un mot de passe initial, active le portail (isPortalActive=true),
 *  - envoie les identifiants par mail (connexion = telephone + mot de passe).
 *
 * No-op (sans erreur) si :
 *  - le client n'a pas d'email (impossible de livrer les identifiants),
 *  - le portail est deja actif (on n'ecrase pas un mot de passe existant : un
 *    client inscrit lui-meme via /register garde le sien).
 *
 * Best-effort : l'envoi du mail n'echoue jamais l'appelant (le client peut
 * toujours utiliser "mot de passe oublie" par SMS).
 */
export async function provisionClientPortalAccess(params: {
  clientId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  isPortalActive?: boolean | null;
  organizationId?: string | null;
}): Promise<ProvisionPortalResult> {
  const email = params.email?.trim();
  if (!email) return { provisioned: false, reason: 'no-email' };
  if (params.isPortalActive) return { provisioned: false, reason: 'already-active' };

  try {
    const password = generatePortalPassword();
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.client.update({
      where: { id: params.clientId },
      data: { passwordHash, isPortalActive: true },
    });
    emailService
      .sendClientPortalCredentials(email, params.fullName, params.phone, password, params.organizationId ?? null, email)
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[ClientPortalAccess] envoi mail identifiants echoue:', (err as Error).message);
      });
    return { provisioned: true };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[ClientPortalAccess] provisioning echoue:', (err as Error).message);
    return { provisioned: false, reason: 'error' };
  }
}
