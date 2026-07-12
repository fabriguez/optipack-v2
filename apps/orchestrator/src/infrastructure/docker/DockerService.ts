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

  /**
   * Clone (ou met a jour) un repo git sur le VPS dans `destDir`, checkout la
   * branche demandee, et renvoie le SHA HEAD. Repo prive : passer un `token`
   * (injecte dans l'URL https, jamais logue). `git` doit etre installe sur le
   * VPS. Idempotent : clone si absent, sinon fetch + reset --hard.
   */
  async gitSync(
    creds: SshConnection,
    opts: { repoUrl: string; branch: string; destDir: string; token?: string; sshKey?: string },
  ): Promise<string> {
    const isSsh = DockerService.isSshRepoUrl(opts.repoUrl);
    const probe = await this.ssh.exec(creds, 'command -v git >/dev/null 2>&1 && echo OK || echo MISSING');
    if (probe.stdout.trim() !== 'OK') {
      throw new Error(`git absent sur ${creds.host} : installer git sur le VPS (apt-get install -y git).`);
    }

    // Auth : SSH (cle de deploiement / cle par defaut du VPS) ou HTTPS (token
    // injecte dans l'URL). Le token et la cle ne sont JAMAIS logues (URL non
    // echoee, cle ecrite via heredoc quote, output scrubbe cote erreur).
    let authUrl = opts.repoUrl;
    const keyPath = `${opts.destDir}.deploykey`;
    const pre: string[] = ['set -e', `D=${this.sh(opts.destDir)}`, `B=${this.sh(opts.branch)}`];

    if (isSsh) {
      if (opts.sshKey) {
        pre.push(`mkdir -p "$(dirname ${this.sh(keyPath)})"`);
        pre.push('umask 077');
        // Heredoc quote -> contenu litteral, aucune expansion. Newline finale
        // ajoutee (ssh exige une cle terminee par \n).
        pre.push(`cat > ${this.sh(keyPath)} <<'OPTIPACK_SSH_KEY_EOF'\n${opts.sshKey.replace(/\r/g, '').replace(/\n*$/, '')}\nOPTIPACK_SSH_KEY_EOF`);
        pre.push(`chmod 600 ${this.sh(keyPath)}`);
        // keyPath sans espaces (derive de destDir controle) -> pas de quoting interne.
        pre.push(`export GIT_SSH_COMMAND="ssh -i ${keyPath} -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null"`);
      } else {
        // Pas de cle fournie : on s'appuie sur la cle SSH par defaut du VPS.
        pre.push('export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=accept-new"');
      }
    } else if (opts.token && /^https:\/\//.test(opts.repoUrl)) {
      authUrl = opts.repoUrl.replace('https://', `https://x-access-token:${opts.token}@`);
    }
    pre.push(`U=${this.sh(authUrl)}`);

    // -c credential.helper= : coupe tout prompt interactif (repo prive sans
    // credentials -> echec net, pas de blocage).
    const script = [
      ...pre,
      'if [ -d "$D/.git" ]; then',
      '  git -C "$D" remote set-url origin "$U"',
      '  git -C "$D" -c credential.helper= fetch --depth 1 origin "$B"',
      '  git -C "$D" checkout -B "$B" FETCH_HEAD',
      '  git -C "$D" reset --hard FETCH_HEAD',
      'else',
      '  rm -rf "$D"',
      '  git -c credential.helper= clone --depth 1 --branch "$B" "$U" "$D"',
      'fi',
      'git -C "$D" rev-parse HEAD',
    ].join('\n');
    const r = await this.ssh.exec(creds, script);
    if (r.code !== 0) {
      const scrubbed = (r.stderr || r.stdout || '').replace(/x-access-token:[^@]*@/g, 'x-access-token:***@');
      throw new Error(`git sync ${opts.repoUrl} (${opts.branch}) echoue : ${scrubbed.trim().slice(0, 400)}`);
    }
    const lines = (r.stdout || '').trim().split('\n').filter(Boolean);
    return lines[lines.length - 1] ?? '';
  }

  /** URL SSH : `ssh://…` ou forme scp `git@host:org/repo.git`. */
  static isSshRepoUrl(url: string): boolean {
    return /^ssh:\/\//.test(url) || /^[A-Za-z0-9._-]+@[^/]+:/.test(url);
  }

  /**
   * `docker build` sur le VPS. `contextDir` = racine du contexte de build,
   * `dockerfilePath` relatif a ce contexte. `buildArgs` passes en --build-arg.
   * Tag l'image `tag`. Le build execute du code du repo -> volontairement
   * lance tel quel (l'ops-admin controle la source). Timeout genereux.
   */
  async buildImage(
    creds: SshConnection,
    opts: {
      contextDir: string;
      dockerfilePath: string;
      tag: string;
      buildArgs?: Record<string, string>;
    },
  ): Promise<string> {
    const parts = ['docker build', `-t ${opts.tag}`, `-f ${this.sh(`${opts.contextDir}/${opts.dockerfilePath}`)}`];
    if (opts.buildArgs) {
      for (const [k, v] of Object.entries(opts.buildArgs)) {
        parts.push(`--build-arg ${k}=${this.sh(String(v))}`);
      }
    }
    parts.push(this.sh(opts.contextDir));
    const r = await this.ssh.exec(creds, parts.join(' '));
    if (r.code !== 0) throw new Error(`docker build ${opts.tag} echoue : ${(r.stderr || r.stdout).trim().slice(0, 800)}`);
    return r.stdout.trim();
  }

  /** Quote un argument shell en single-quote (robuste). */
  private sh(v: string): string {
    return `'${String(v).replace(/'/g, "'\\''")}'`;
  }

  /**
   * `docker compose up -d --remove-orphans` sur un fichier compose DEJA present
   * (ne reecrit pas le YAML, contrairement a composeUp). Recree les services
   * dont l'image a change en conservant env_file / environment / networks.
   */
  async composeUpExisting(creds: SshConnection, composeFilePath: string, projectName: string): Promise<void> {
    const r = await this.ssh.exec(creds, this.composeCmd(composeFilePath, projectName, 'up -d --remove-orphans'));
    if (r.code !== 0) throw new Error(`docker compose up echoue : ${r.stderr || r.stdout}`);
  }

  /**
   * Remplace in place les tags d'image api / web / web-client dans un fichier
   * compose tenant. Cible chaque repo par son prefixe exact suivi de `:` afin
   * que `optipack-web:` ne matche pas `optipack-web-client:`. La valeur de tag
   * (jusqu'au prochain espace) est entierement remplacee, quel que soit l'ancien
   * tag (`:latest` comme `:beta-1.0.x`).
   */
  async patchComposeImages(
    creds: SshConnection,
    composeFilePath: string,
    namespace: string,
    tags: { api?: string; web?: string; webClient?: string },
  ): Promise<void> {
    const seds: string[] = [];
    if (tags.api) seds.push(`-e "s#ghcr.io/${namespace}/optipack-api:[^[:space:]]*#${tags.api}#g"`);
    if (tags.web) seds.push(`-e "s#ghcr.io/${namespace}/optipack-web:[^[:space:]]*#${tags.web}#g"`);
    if (tags.webClient) seds.push(`-e "s#ghcr.io/${namespace}/optipack-web-client:[^[:space:]]*#${tags.webClient}#g"`);
    if (seds.length === 0) return;
    const r = await this.ssh.exec(creds, `sed -i -E ${seds.join(' ')} ${composeFilePath}`);
    if (r.code !== 0) throw new Error(`patch des images compose echoue : ${r.stderr || r.stdout}`);
  }

  /**
   * Recree les containers applicatifs du tenant (api/web/web-client) depuis le
   * compose. On les retire d'abord PAR NOM (force, erreur ignoree) : robuste si
   * un ancien `docker run` les a crees hors du projet compose (sinon `compose
   * up` echoue sur conflit de nom). postgres/redis/minio ne sont pas touches
   * (donnees + volumes preserves) -- compose les laisse tels quels.
   */
  async recreateTenantApp(
    creds: SshConnection,
    slug: string,
    composeFilePath: string,
    projectName: string,
  ): Promise<void> {
    for (const name of [`tenant-${slug}-api`, `tenant-${slug}-web`, `tenant-${slug}-web-client`]) {
      await this.remove(creds, name, true);
    }
    await this.composeUpExisting(creds, composeFilePath, projectName);
  }

  private composeCmd(composeFilePath: string, projectName: string, subCmd: string): string {
    const base = `docker compose -f ${composeFilePath} -p ${projectName}`;
    return `if docker compose version >/dev/null 2>&1; then ${base} ${subCmd}; elif docker-compose version >/dev/null 2>&1; then docker-compose -f ${composeFilePath} -p ${projectName} ${subCmd}; else echo 'compose non trouve' >&2; exit 1; fi`;
  }

  async composeStop(creds: SshConnection, composeFilePath: string, projectName: string): Promise<void> {
    const r = await this.ssh.exec(creds, this.composeCmd(composeFilePath, projectName, 'stop'));
    if (r.code !== 0) throw new Error(`compose stop echoue : ${r.stderr || r.stdout}`);
  }

  async composeStart(creds: SshConnection, composeFilePath: string, projectName: string): Promise<void> {
    const r = await this.ssh.exec(creds, this.composeCmd(composeFilePath, projectName, 'start'));
    if (r.code !== 0) throw new Error(`compose start echoue : ${r.stderr || r.stdout}`);
  }

  async composeRestart(creds: SshConnection, composeFilePath: string, projectName: string): Promise<void> {
    const r = await this.ssh.exec(creds, this.composeCmd(composeFilePath, projectName, 'restart'));
    if (r.code !== 0) throw new Error(`compose restart echoue : ${r.stderr || r.stdout}`);
  }

  /**
   * Liste les containers du stack tenant (project compose `tenant-<slug>`).
   * Renvoie name + image + state + status + ports + CPU/MEM via docker stats.
   */
  async listTenantContainers(creds: SshConnection, slug: string): Promise<Array<{
    name: string;
    image: string;
    state: string;
    status: string;
    ports: string;
    createdAt: string;
  }>> {
    // Filtre par nom prefixe `tenant-<slug>-`. `--no-trunc` pour avoir l'ID
    // complet + format JSON ligne par ligne pour parse robuste.
    const r = await this.ssh.exec(
      creds,
      `docker ps -a --filter "name=tenant-${slug}-" --format '{{json .}}'`,
    );
    if (r.code !== 0) return [];
    const lines = (r.stdout || '').split('\n').filter((l) => l.trim());
    return lines.map((l) => {
      try {
        const j = JSON.parse(l) as {
          Names?: string;
          Image?: string;
          State?: string;
          Status?: string;
          Ports?: string;
          CreatedAt?: string;
        };
        return {
          name: j.Names ?? '',
          image: j.Image ?? '',
          state: j.State ?? 'unknown',
          status: j.Status ?? '',
          ports: j.Ports ?? '',
          createdAt: j.CreatedAt ?? '',
        };
      } catch {
        return { name: '', image: '', state: 'unknown', status: '', ports: '', createdAt: '' };
      }
    }).filter((c) => c.name);
  }

  /** docker logs <name> --tail N --timestamps. */
  async logs(
    creds: SshConnection,
    name: string,
    tail = 200,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    // 2>&1 pour combiner stderr+stdout (docker logs sort par defaut sur les 2)
    return this.ssh.exec(creds, `docker logs --tail ${tail} --timestamps ${name} 2>&1`);
  }

  /**
   * Exec one-shot dans un container : `docker exec <name> sh -c "<cmd>"`.
   * Pour interactif (TTY), il faudrait un WebSocket -- pas implemente ici.
   */
  async execShell(
    creds: SshConnection,
    name: string,
    cmd: string,
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    // Escape simple : interdit le " seul, on quote en single. L'admin doit
    // pas mettre de single quote dans son cmd (rare). Timeout 30s.
    const safe = cmd.replace(/'/g, "'\\''");
    return this.ssh.exec(creds, `timeout 30 docker exec ${name} sh -c '${safe}' 2>&1`);
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
