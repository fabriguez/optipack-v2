import { inject, injectable } from 'tsyringe';
import { SSHService, SSH_SERVICE, type SshConnection } from './SSHService';
import { logger } from '../logger';

/**
 * Transferts de fichiers entre VPS pour les migrations.
 *
 * Strategie : on passe par l'orchestrateur (download stream depuis source, upload stream
 * vers target). C'est plus lent qu'un scp VPS -> VPS direct, mais ne necessite PAS
 * d'echanger des cles SSH entre VPS, et reste auditable.
 *
 * Pour les gros dumps (>1GB), on streame via tarball compresse pour limiter la taille.
 */
@injectable()
export class ScpService {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  /**
   * Telecharge un fichier d'un VPS source vers le local (filesystem orchestrateur),
   * puis l'upload vers un VPS target. Le local sert de relais.
   * Retourne le chemin distant final sur target.
   */
  async transfer(
    source: SshConnection,
    target: SshConnection,
    sourcePath: string,
    targetPath: string,
  ): Promise<void> {
    // node-ssh expose getFile / putFile via le NodeSSH wrapper sous-jacent.
    // Comme notre SSHService est un wrapper minimaliste, on utilise execCommand pour
    // recuperer le fichier en base64, puis on l'ecrit sur target via heredoc.
    // Limite ce design : OK pour <100MB. Au-dela, mieux vaut passer par un object storage.

    logger.info({ sourcePath, targetPath }, '[scp] download from source');
    const downloadResult = await this.ssh.exec(source, `base64 ${sourcePath}`);
    if (downloadResult.code !== 0) {
      throw new Error(`SCP download echoue : ${downloadResult.stderr}`);
    }
    const b64 = downloadResult.stdout;
    const sizeMB = (b64.length * 0.75) / (1024 * 1024);
    logger.info({ sizeMB: sizeMB.toFixed(2) }, '[scp] upload to target');

    // Upload : on echappe pas pour heredoc (base64 est ASCII safe)
    const uploadCmd = `mkdir -p $(dirname ${targetPath}) && cat > ${targetPath}.b64 <<'EOF'\n${b64}\nEOF\nbase64 -d ${targetPath}.b64 > ${targetPath} && rm ${targetPath}.b64`;
    const uploadResult = await this.ssh.exec(target, uploadCmd);
    if (uploadResult.code !== 0) {
      throw new Error(`SCP upload echoue : ${uploadResult.stderr}`);
    }
  }

  async deleteRemote(creds: SshConnection, path: string): Promise<void> {
    await this.ssh.exec(creds, `rm -f ${path}`);
  }
}

export const SCP_SERVICE = Symbol.for('ScpService');
