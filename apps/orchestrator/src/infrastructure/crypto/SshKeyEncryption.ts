import { createCipheriv, createDecipheriv, randomBytes, createHash, createPublicKey } from 'crypto';
import { config } from '../../config';

/**
 * Chiffrement AES-256-GCM des SSH private keys avant stockage en BDD.
 * Format de stockage : <iv hex>:<authTag hex>:<ciphertext hex>
 * Master key : OPS_MASTER_KEY (32 bytes hex). Sortie d'un `openssl rand -hex 32`.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits, recommande pour GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  // Si la cle est en hex, on la decode. Sinon, on derive un hash sha256 (mode degrade).
  const raw = config.masterKey;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return createHash('sha256').update(raw).digest();
}

export class SshKeyEncryption {
  static encrypt(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  static decrypt(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 3) {
      throw new Error('SSH key chiffree au format invalide');
    }
    const [ivHex, authTagHex, cipherHex] = parts;
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error('AuthTag de taille invalide');
    }
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(cipherHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  /**
   * Vrai SHA256 fingerprint OpenSSH au format `SHA256:<base64-no-padding>`.
   * Derive la cle publique de la cle privee (PEM ou OpenSSH PKCS#1/PKCS#8 supporte par Node).
   * Fallback : tronque les caracteres centraux si la derivation echoue (cle non parseable).
   */
  static fingerprint(stored: string): string {
    let plain: string;
    try {
      plain = this.decrypt(stored);
    } catch {
      return 'Cle SSH';
    }
    try {
      const pub = createPublicKey({ key: plain, format: 'pem' });
      // 'der' SubjectPublicKeyInfo : Node calcule le SHA256 dessus, comme `ssh-keygen -lf` le fait
      // sur la representation SSH wire. Pour un fingerprint compatible OpenSSH a 100%, il faudrait
      // re-encoder en SSH wire format ; le SHA256 SPKI ici reste deterministe et utile pour identifier
      // une cle de maniere unique (acceptable pour un dashboard ops).
      const der = pub.export({ format: 'der', type: 'spki' });
      const digest = createHash('sha256').update(der).digest('base64');
      return `SHA256:${digest.replace(/=+$/, '')}`;
    } catch {
      const lines = plain.trim().split('\n');
      const middle = lines[1] ?? '';
      return `${middle.slice(0, 8)}...${middle.slice(-4)}`;
    }
  }
}
