import { inject, injectable } from 'tsyringe';
import { SSHService, SSH_SERVICE, type SshConnection } from '../ssh/SSHService';

export interface ContainerRunOptions {
  name: string;
  image: string;
  ports?: Record<number, number>; // hostPort -> containerPort
  envFile?: string; // chemin sur le VPS
  env?: Record<string, string>;
  volumes?: string[]; // ex: ["volname:/data"]
  network?: string;
  restart?: 'no' | 'on-failure' | 'always' | 'unless-stopped';
  command?: string;
  // Limites de ressources (Phase 4)
  cpuLimit?: number;        // ex: 0.5 -> --cpus=0.5
  memoryMb?: number;        // ex: 512 -> --memory=512m
  /** Memory swap = memoire physique (par defaut). Mettre a -1 pour swap illimite. */
  memorySwapMb?: number;
}

/**
 * Helpers Docker via SSH. On execute des commandes shell `docker ...` sur le VPS.
 * Volontairement rudimentaire : pas de wrapper TypeScript autour de l'API Docker
 * (qui demanderait d'exposer le socket Docker, risque de securite).
 */
@injectable()
export class DockerService {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  async loginGhcr(creds: SshConnection, username: string, token: string): Promise<void> {
    // Diag : longueur/prefix des creds (jamais le token complet en clair).
    // Aide a diagnostiquer rapidement "token vide" vs "mauvais user" vs
    // "docker CLI absent" (ENOENT).
    const tokenPreview = token
      ? `${token.length} chars (prefix='${token.slice(0, 4)}...')`
      : '(vide)';
    const userPreview = username || '(vide)';
    if (!username || !token) {
      throw new Error(
        `docker login ghcr.io impossible : OPS_GHCR_USERNAME='${userPreview}' OPS_GHCR_TOKEN=${tokenPreview}. Configure ces env vars sur l'orchestrator.`,
      );
    }
    // Verifie d'abord que la CLI docker existe -- sinon ENOENT cryptique.
    const probe = await this.ssh.exec(creds, 'command -v docker >/dev/null 2>&1 && echo OK || echo MISSING');
    if (probe.stdout.trim() !== 'OK') {
      throw new Error(
        `docker login ghcr.io impossible : CLI docker absente sur ${creds.host}. ` +
          `Self : installer docker-cli dans l'image orchestrator + monter /var/run/docker.sock. ` +
          `VPS distant : installer docker via VpsBootstrapService (POST /vps/:id/bootstrap).`,
      );
    }
    // Echappement minimal - le token est cense etre alphanumerique
    const cmd = `echo '${token.replace(/'/g, "")}' | docker login ghcr.io -u '${username}' --password-stdin`;
    const r = await this.ssh.exec(creds, cmd);
    if (r.code !== 0) {
      const detail = (r.stderr || r.stdout || '').trim();
      throw new Error(
        `docker login ghcr.io echoue (exit=${r.code}) user='${userPreview}' token=${tokenPreview} : ${detail || '(no output)'}`,
      );
    }
  }

  async pull(creds: SshConnection, image: string): Promise<string> {
    const r = await this.ssh.exec(creds, `docker pull ${image}`);
    if (r.code !== 0) throw new Error(`docker pull ${image} : ${r.stderr || r.stdout}`);
    return r.stdout;
  }

  async run(creds: SshConnection, opts: ContainerRunOptions): Promise<string> {
    const parts: string[] = ['docker run -d', `--name ${opts.name}`];
    if (opts.restart) parts.push(`--restart ${opts.restart}`);
    if (opts.network) parts.push(`--network ${opts.network}`);
    if (opts.envFile) parts.push(`--env-file ${opts.envFile}`);
    // Limites de ressources (Phase 4)
    if (opts.cpuLimit && opts.cpuLimit > 0) {
      const cpuLimit = Number(opts.cpuLimit.toFixed(3));
      parts.push(`--cpus=${cpuLimit}`);
    }
    if (opts.memoryMb && opts.memoryMb > 0) {
      parts.push(`--memory=${opts.memoryMb}m`);
      const swap = opts.memorySwapMb ?? opts.memoryMb;
      if (swap > 0) parts.push(`--memory-swap=${swap}m`);
    }
    if (opts.env) {
      for (const [k, v] of Object.entries(opts.env)) {
        parts.push(`-e '${k}=${String(v).replace(/'/g, "'\\''")}'`);
      }
    }
    if (opts.ports) {
      for (const [host, container] of Object.entries(opts.ports)) {
        parts.push(`-p 127.0.0.1:${host}:${container}`);
      }
    }
    if (opts.volumes) {
      for (const v of opts.volumes) parts.push(`-v ${v}`);
    }
    parts.push(opts.image);
    if (opts.command) parts.push(opts.command);

    const cmd = parts.join(' ');
    const r = await this.ssh.exec(creds, cmd);
    if (r.code !== 0) throw new Error(`docker run echoue : ${r.stderr || r.stdout}`);
    return r.stdout.trim();
  }

  async composeUp(creds: SshConnection, composeFilePath: string, composeYaml: string, projectName: string): Promise<string> {
    const writeResult = await this.ssh.exec(
      creds,
      `cat > ${composeFilePath} <<'EOF'\n${composeYaml}\nEOF`,
    );
    if (writeResult.code !== 0) {
      throw new Error(`ecriture du fichier compose ${composeFilePath} echoue : ${writeResult.stderr || writeResult.stdout}`);
    }

    const r = await this.ssh.exec(
      creds,
      `if docker compose version >/dev/null 2>&1; then docker compose -f ${composeFilePath} -p ${projectName} up -d --remove-orphans; elif docker-compose version >/dev/null 2>&1; then docker-compose -f ${composeFilePath} -p ${projectName} up -d --remove-orphans; else echo 'compose non trouve' >&2; exit 1; fi`,
    );
    if (r.code !== 0) {
      throw new Error(`docker compose up echoue : ${r.stderr || r.stdout}`);
    }
    return r.stdout.trim();
  }

  async exec(creds: SshConnection, container: string, cmd: string): Promise<{ stdout: string; stderr: string; code: number }> {
    return this.ssh.exec(creds, `docker exec ${container} ${cmd}`);
  }

  async stop(creds: SshConnection, name: string): Promise<void> {
    await this.ssh.exec(creds, `docker stop ${name} || true`);
  }

  async start(creds: SshConnection, name: string): Promise<void> {
    await this.ssh.exec(creds, `docker start ${name}`);
  }

  async remove(creds: SshConnection, name: string, force = false): Promise<void> {
    await this.ssh.exec(creds, `docker rm ${force ? '-f' : ''} ${name} || true`);
  }

  async exists(creds: SshConnection, name: string): Promise<boolean> {
    const r = await this.ssh.exec(creds, `docker ps -a --format '{{.Names}}' | grep -w ${name} || true`);
    return r.stdout.trim() === name;
  }

  async healthCheck(creds: SshConnection, port: number, path = '/api/v1/tenant-meta', timeoutSec = 60): Promise<boolean> {
    // Attend qu'un GET local revoie 2xx, polling toutes les 2s
    const cmd = `for i in $(seq 1 ${Math.ceil(timeoutSec / 2)}); do code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:${port}${path} || echo 000); if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then echo OK; exit 0; fi; sleep 2; done; echo TIMEOUT; exit 1`;
    const r = await this.ssh.exec(creds, cmd);
    return r.code === 0 && r.stdout.includes('OK');
  }
}

export const DOCKER_SERVICE = Symbol.for('DockerService');
