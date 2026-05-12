import { injectable } from 'tsyringe';
import { NodeSSH } from 'node-ssh';
import { SshKeyEncryption } from '../crypto/SshKeyEncryption';

export interface SshConnection {
  host: string;
  port: number;
  username: string;
  /** Stocke chiffre. Sera dechiffre par ce service avant la connexion. */
  sshKeyEncrypted: string;
}

export interface SshExecResult {
  stdout: string;
  stderr: string;
  code: number;
}

export interface VpsUsage {
  cpuUsagePct: number;
  ramUsagePct: number;
  diskUsagePct: number;
}

export interface VpsSpecs {
  totalCpu: number;
  totalRamMb: number;
  totalDiskGb: number;
  kernel?: string;
  os?: string;
}

/**
 * Wrapper SSH pour les operations sur les VPS tenants.
 * Toujours fermer la connexion via `try/finally`.
 */
@injectable()
export class SSHService {
  private async connect(creds: SshConnection): Promise<NodeSSH> {
    const ssh = new NodeSSH();
    const privateKey = SshKeyEncryption.decrypt(creds.sshKeyEncrypted);
    await ssh.connect({
      host: creds.host,
      port: creds.port,
      username: creds.username,
      privateKey,
      readyTimeout: 10_000,
    });
    return ssh;
  }

  /**
   * Test la connexion : retourne true si OK, false sinon.
   * Utilise par l'endpoint `/ops/vps/:id/test-connection`.
   */
  async testConnection(creds: SshConnection): Promise<{ ok: boolean; message?: string }> {
    let ssh: NodeSSH | null = null;
    try {
      ssh = await this.connect(creds);
      const r = await ssh.execCommand('echo ok');
      if (r.code !== 0) {
        return { ok: false, message: r.stderr || 'echo command failed' };
      }
      return { ok: true };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, message: msg };
    } finally {
      ssh?.dispose();
    }
  }

  /**
   * Execute une commande shell distante. Releve une erreur si code != 0.
   */
  async exec(creds: SshConnection, command: string): Promise<SshExecResult> {
    const ssh = await this.connect(creds);
    try {
      const r = await ssh.execCommand(command);
      return { stdout: r.stdout, stderr: r.stderr, code: r.code ?? 0 };
    } finally {
      ssh.dispose();
    }
  }

  /**
   * Renvoie un snapshot d'usage CPU/RAM/disque via parsing top + df.
   * Best-effort : si le parsing echoue, retourne 0.
   */
  async getUsage(creds: SshConnection): Promise<VpsUsage> {
    const ssh = await this.connect(creds);
    try {
      // CPU + RAM via /proc/loadavg + free
      const [cpu, mem, disk] = await Promise.all([
        ssh.execCommand("top -bn1 | grep 'Cpu(s)' | awk '{print $2 + $4}'"),
        ssh.execCommand("free | grep Mem | awk '{print ($3/$2) * 100}'"),
        ssh.execCommand("df / | tail -1 | awk '{print $5}' | tr -d '%'"),
      ]);
      return {
        cpuUsagePct: this.parsePct(cpu.stdout),
        ramUsagePct: this.parsePct(mem.stdout),
        diskUsagePct: this.parsePct(disk.stdout),
      };
    } finally {
      ssh.dispose();
    }
  }

  /**
   * Probe les specs hardware du VPS (cpu cores, RAM totale, disque racine).
   * Lance sur testConnection + creation, pour eviter de demander a l'admin
   * de les saisir manuellement.
   */
  async getSpecs(creds: SshConnection): Promise<VpsSpecs> {
    const ssh = await this.connect(creds);
    try {
      const [cpu, ramKb, diskKb, kernel, os] = await Promise.all([
        ssh.execCommand('nproc'),
        ssh.execCommand("grep MemTotal /proc/meminfo | awk '{print $2}'"),
        // Total du systeme de fichiers racine, en Ko.
        ssh.execCommand("df -k / | tail -1 | awk '{print $2}'"),
        ssh.execCommand('uname -r'),
        ssh.execCommand(
          "sh -c '. /etc/os-release 2>/dev/null && printf %s \"$PRETTY_NAME\" || uname -s'",
        ),
      ]);
      const totalCpu = parseInt(cpu.stdout.trim(), 10);
      const ramKbN = parseInt(ramKb.stdout.trim(), 10);
      const diskKbN = parseInt(diskKb.stdout.trim(), 10);
      return {
        totalCpu: Number.isFinite(totalCpu) ? totalCpu : 0,
        totalRamMb: Number.isFinite(ramKbN) ? Math.round(ramKbN / 1024) : 0,
        totalDiskGb: Number.isFinite(diskKbN) ? Math.round(diskKbN / 1024 / 1024) : 0,
        kernel: kernel.stdout.trim() || undefined,
        os: os.stdout.trim() || undefined,
      };
    } finally {
      ssh.dispose();
    }
  }

  private parsePct(s: string): number {
    const n = parseFloat(s.trim());
    if (Number.isNaN(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }
}

export const SSH_SERVICE = Symbol.for('SSHService');
