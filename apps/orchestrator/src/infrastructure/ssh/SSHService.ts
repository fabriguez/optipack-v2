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
   * Execute une commande shell distante via SSH. Releve une erreur si
   * code != 0. Le VPS self (127.0.0.1) doit avoir un sshd qui ecoute en
   * loopback + une cle authorized_keys correspondant a celle stockee.
   * Voir doc VPS / formulaire Add VPS pour les pre-requis self.
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
   * Renvoie un snapshot d'usage CPU/RAM/disque.
   *
   * CPU : on lit /proc/stat deux fois a 1s d'intervalle et on calcule
   *       le pourcentage de temps non-idle. C'est la methode standard,
   *       beaucoup plus fiable que `top -bn1` qui renvoie souvent 100%
   *       sur la 1ere mesure (selon distro/locale).
   * RAM : free -m -> used/total (exclut buffers/cache via /MemAvailable).
   * Disque : df / .
   */
  async getUsage(creds: SshConnection): Promise<VpsUsage> {
    const ssh = await this.connect(creds);
    try {
      // Mesure CPU via delta /proc/stat sur 1s.
      const cpuScript =
        'a=$(grep "^cpu " /proc/stat); ' +
        'sleep 1; ' +
        'b=$(grep "^cpu " /proc/stat); ' +
        'echo "$a"; echo "$b"';
      const [cpuRaw, memRaw, diskRaw] = await Promise.all([
        ssh.execCommand(cpuScript),
        // MemAvailable / MemTotal = part libre ; on retourne (1 - free) * 100.
        ssh.execCommand(
          "awk '/MemTotal:/ {t=$2} /MemAvailable:/ {a=$2} END {if (t>0) print (1 - a/t) * 100; else print 0}' /proc/meminfo",
        ),
        ssh.execCommand("df / | tail -1 | awk '{print $5}' | tr -d '%'"),
      ]);

      return {
        cpuUsagePct: this.parseCpuDelta(cpuRaw.stdout),
        ramUsagePct: this.parsePct(memRaw.stdout),
        diskUsagePct: this.parsePct(diskRaw.stdout),
      };
    } finally {
      ssh.dispose();
    }
  }

  /**
   * Parse les deux snapshots de `/proc/stat` (separes par \n) et calcule
   * le pourcentage d'utilisation CPU sur l'intervalle.
   * Format attendu de chaque ligne: "cpu user nice system idle iowait irq softirq steal guest guest_nice"
   */
  private parseCpuDelta(raw: string): number {
    const lines = raw.split(/\r?\n/).filter((l) => l.startsWith('cpu '));
    if (lines.length < 2) return 0;
    const parse = (l: string): number[] =>
      l
        .split(/\s+/)
        .slice(1, 9) // user nice system idle iowait irq softirq steal
        .map((n) => Number(n) || 0);
    const a = parse(lines[0]);
    const b = parse(lines[1]);
    if (a.length < 4 || b.length < 4) return 0;
    const total = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
    const idleA = a[3] + (a[4] ?? 0); // idle + iowait
    const idleB = b[3] + (b[4] ?? 0);
    const dTotal = total(b) - total(a);
    const dIdle = idleB - idleA;
    if (dTotal <= 0) return 0;
    return Math.max(0, Math.min(100, ((dTotal - dIdle) / dTotal) * 100));
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
