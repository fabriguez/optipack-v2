import { inject, injectable } from 'tsyringe';
import { SSHService, SSH_SERVICE, type SshConnection } from '../../infrastructure/ssh/SSHService';
import { logger } from '../../infrastructure/logger';

/**
 * Installe sur un VPS fraichement ajoute tout ce qu'OptiPack attend :
 *  - apt update + paquets de base (curl, git, jq, ca-certificates, gnupg)
 *  - Docker engine + plugin compose (script officiel get.docker.com)
 *  - Caddy en container (avec admin API 127.0.0.1:2019)
 *  - UFW (defaut deny incoming, allow 22/80/443) -- enable seulement si OPS_UFW_AUTO_ENABLE=true
 *  - Repertoires ~/.optipack et /tmp pour les fichiers de provisioning
 *
 * Idempotent : on detecte ce qui est deja installe avant de tenter une
 * installation. Best-effort : un echec d'install Caddy ne bloque pas
 * l'enregistrement du VPS (admin peut reessayer manuellement).
 */
@injectable()
export class VpsBootstrapService {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  /**
   * Ne lance les installations que si l'admin a demande le bootstrap auto
   * (input.autoBootstrap == true OU env OPS_VPS_AUTO_BOOTSTRAP=true).
   * Retourne un rapport par etape pour audit + UI.
   */
  async bootstrap(
    creds: SshConnection,
    options: { autoEnableUfw?: boolean } = {},
  ): Promise<BootstrapReport> {
    const report: BootstrapReport = {
      basePackages: 'skipped',
      docker: 'skipped',
      caddy: 'skipped',
      ufw: 'skipped',
      directories: 'skipped',
    };

    // 1. Paquets de base
    report.basePackages = await this.installBasePackages(creds);
    // 2. Docker + compose plugin
    report.docker = await this.installDocker(creds);
    // 3. Caddy (en container -- pas de paquet system pour rester homogene
    //    entre VPS Debian/Ubuntu/etc).
    report.caddy = await this.installCaddyContainer(creds);
    // 4. UFW : configure les regles ; enable seulement si demande.
    report.ufw = await this.configureUfw(creds, options.autoEnableUfw ?? false);
    // 5. Dirs de travail
    report.directories = await this.ensureDirectories(creds);

    return report;
  }

  private async installBasePackages(creds: SshConnection): Promise<StepResult> {
    const cmd = `
      set -e
      if ! command -v curl >/dev/null || ! command -v git >/dev/null || ! command -v jq >/dev/null; then
        sudo apt-get update -qq
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
          curl git jq ca-certificates gnupg lsb-release psmisc ufw
      fi
      echo OK
    `;
    return this.runStep(creds, 'base packages', cmd);
  }

  private async installDocker(creds: SshConnection): Promise<StepResult> {
    // Skip si docker deja la (idempotent). Sinon installe via script officiel.
    const cmd = `
      set -e
      if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
        echo "ALREADY_INSTALLED"
        exit 0
      fi
      curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
      sudo sh /tmp/get-docker.sh
      sudo usermod -aG docker ${creds.username} 2>/dev/null || true
      sudo systemctl enable --now docker
      docker --version
    `;
    return this.runStep(creds, 'docker engine', cmd);
  }

  private async installCaddyContainer(creds: SshConnection): Promise<StepResult> {
    // Lance Caddy en container. L'admin API ecoute sur 127.0.0.1:2019 (jamais
    // exposee a internet). Config initiale minimaliste -- l'orchestrator la
    // remplacera via /load au premier provisioning de tenant.
    const cmd = `
      set -e
      if docker ps --format '{{.Names}}' | grep -qx caddy; then
        echo "ALREADY_RUNNING"
        exit 0
      fi
      docker network inspect caddy-net >/dev/null 2>&1 || docker network create caddy-net
      docker volume inspect caddy-data >/dev/null 2>&1 || docker volume create caddy-data
      docker volume inspect caddy-config >/dev/null 2>&1 || docker volume create caddy-config
      # Config bootstrap : Caddy minimal avec admin actif. L'orchestrator
      # remplace via POST /load au premier provisioning.
      mkdir -p ~/.optipack
      cat > ~/.optipack/caddy-bootstrap.json <<'CADDY_BOOT_EOF'
{ "admin": { "listen": "0.0.0.0:2019", "origins": ["http://orchestrator","http://localhost:2019","http://127.0.0.1:2019"] }, "apps": { "http": { "servers": { "srv": { "listen": [":80", ":443"], "routes": [] } } } } }
CADDY_BOOT_EOF
      docker run -d --name caddy --restart unless-stopped \
        --network caddy-net \
        -p 80:80 -p 443:443 -p 127.0.0.1:2019:2019 \
        -v caddy-data:/data -v caddy-config:/config \
        -v ~/.optipack/caddy-bootstrap.json:/etc/caddy/bootstrap.json:ro \
        caddy:2-alpine caddy run --config /etc/caddy/bootstrap.json --resume
      docker exec caddy caddy version
    `;
    return this.runStep(creds, 'caddy container', cmd);
  }

  private async configureUfw(creds: SshConnection, enable: boolean): Promise<StepResult> {
    // Reset clean : default deny incoming + allow outgoing + SSH/HTTP/HTTPS.
    // N'ENABLE PAS par defaut : enable interfere avec les regles iptables que
    // docker pose lui-meme. L'admin doit l'enable manuellement quand il est
    // sur que tout marche (ou passer autoEnableUfw=true).
    const enableCmd = enable ? 'sudo ufw --force enable' : 'echo "ufw not enabled (autoEnableUfw=false)"';
    const cmd = `
      set -e
      sudo ufw default deny incoming
      sudo ufw default allow outgoing
      sudo ufw allow 22/tcp
      sudo ufw allow 80/tcp
      sudo ufw allow 443/tcp
      ${enableCmd}
      sudo ufw status verbose | head -20 || true
    `;
    return this.runStep(creds, 'ufw rules', cmd);
  }

  private async ensureDirectories(creds: SshConnection): Promise<StepResult> {
    const cmd = `
      set -e
      mkdir -p ~/.optipack
      chmod 700 ~/.optipack
      echo OK
    `;
    return this.runStep(creds, 'directories', cmd);
  }

  private async runStep(creds: SshConnection, label: string, cmd: string): Promise<StepResult> {
    try {
      const r = await this.ssh.exec(creds, cmd);
      if (r.code !== 0) {
        logger.warn({ label, code: r.code, stderr: r.stderr?.slice(0, 500) }, `[vps-bootstrap] ${label} FAIL`);
        return { status: 'failed', detail: (r.stderr || r.stdout || '').slice(0, 500) };
      }
      const out = (r.stdout || '').trim();
      if (out.includes('ALREADY_INSTALLED') || out.includes('ALREADY_RUNNING')) {
        return { status: 'already-present' };
      }
      return { status: 'installed', detail: out.slice(0, 200) };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ label, err: msg }, `[vps-bootstrap] ${label} EXCEPTION`);
      return { status: 'failed', detail: msg.slice(0, 300) };
    }
  }
}

export const VPS_BOOTSTRAP_SERVICE = Symbol.for('VpsBootstrapService');

export type StepStatus = 'skipped' | 'installed' | 'already-present' | 'failed';
export interface StepResult {
  status: StepStatus;
  detail?: string;
}
export interface BootstrapReport {
  basePackages: StepResult | 'skipped';
  docker: StepResult | 'skipped';
  caddy: StepResult | 'skipped';
  ufw: StepResult | 'skipped';
  directories: StepResult | 'skipped';
}
