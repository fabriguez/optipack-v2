import { inject, injectable } from 'tsyringe';
import { SSHService, SSH_SERVICE, type SshConnection } from '../ssh/SSHService';

/**
 * Pilote UFW (Uncomplicated Firewall) sur un VPS via SSH.
 *
 * NOTE archi : avec notre stack actuelle (containers bindes sur 127.0.0.1
 * + Caddy en frontal pour :80/:443), creer un tenant n'ouvre **aucun port**
 * dans UFW. Les seuls ports a maintenir ouverts sont :
 *   - 22  (SSH admin)
 *   - 80  (HTTP -> redirect HTTPS par Caddy)
 *   - 443 (HTTPS, Caddy proxy vers les containers)
 *
 * UFW reste utile pour : bootstrap d'un nouveau VPS, debug temporaire,
 * audit, ou si plus tard on expose des ports specifiques en bypass de Caddy.
 *
 * Toutes les commandes utilisent `sudo` car ufw exige root. L'utilisateur SSH
 * doit avoir un sudo NOPASSWD sur /usr/sbin/ufw, sinon configurer le compte
 * en consequence.
 */

export interface UfwRule {
  /** Index dans `ufw status numbered` (1-based). Stable tant que personne ne modifie l'ordre. */
  index: number;
  /** Texte brut de la regle (ex: "443/tcp ALLOW Anywhere"). Affichage UI. */
  raw: string;
  action: 'ALLOW' | 'DENY' | 'REJECT' | 'LIMIT';
  /** Port + proto si parsable ("443/tcp"), sinon null (ex: services nommes OpenSSH). */
  target: string;
  source: string;
}

export interface UfwStatus {
  enabled: boolean;
  defaultPolicy: { incoming: string; outgoing: string; routed: string };
  rules: UfwRule[];
  /** Sortie brute pour debug. */
  raw: string;
}

@injectable()
export class UFWService {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  /**
   * Lit l'etat actuel. Idempotent. Si UFW n'est pas installe, retourne
   * `enabled=false` + raw=stderr.
   */
  async status(creds: SshConnection): Promise<UfwStatus> {
    const r = await this.ssh.exec(creds, 'sudo ufw status numbered verbose 2>&1 || true');
    const out = `${r.stdout}\n${r.stderr}`;
    return parseUfwStatus(out);
  }

  async enable(creds: SshConnection): Promise<{ ok: boolean; message?: string }> {
    // --force evite le prompt "may disrupt SSH connections" qui bloque non-interactif
    const r = await this.ssh.exec(creds, 'sudo ufw --force enable 2>&1');
    return { ok: r.code === 0, message: r.stdout || r.stderr };
  }

  async disable(creds: SshConnection): Promise<{ ok: boolean; message?: string }> {
    const r = await this.ssh.exec(creds, 'sudo ufw disable 2>&1');
    return { ok: r.code === 0, message: r.stdout || r.stderr };
  }

  async addRule(
    creds: SshConnection,
    rule: { action: 'allow' | 'deny' | 'reject' | 'limit'; spec: string },
  ): Promise<{ ok: boolean; message?: string }> {
    // spec est un fragment ufw : "22/tcp", "80", "from 1.2.3.4 to any port 443", ...
    // On sanitize basiquement pour eviter les caracteres dangereux.
    if (!/^[a-zA-Z0-9 ./:_\-]+$/.test(rule.spec)) {
      return { ok: false, message: 'spec contient des caracteres non autorises' };
    }
    const r = await this.ssh.exec(creds, `sudo ufw ${rule.action} ${rule.spec} 2>&1`);
    return { ok: r.code === 0, message: r.stdout || r.stderr };
  }

  async deleteRule(
    creds: SshConnection,
    index: number,
  ): Promise<{ ok: boolean; message?: string }> {
    if (!Number.isInteger(index) || index <= 0) {
      return { ok: false, message: 'index invalide' };
    }
    // -y assume "yes" sur le prompt de confirmation
    const r = await this.ssh.exec(creds, `echo y | sudo ufw delete ${index} 2>&1`);
    return { ok: r.code === 0, message: r.stdout || r.stderr };
  }

  /**
   * Pose la baseline OptiPack : SSH + HTTP + HTTPS, refus le reste en entree.
   * Idempotent : ufw refuse les doublons silencieusement.
   */
  async applyBaseline(creds: SshConnection): Promise<{ ok: boolean; messages: string[] }> {
    // Self / loopback : orchestrator tourne dans un container sans acces a
    // l'host ufw (et sans sudo TTY). On skip silencieux -- l'admin gere ufw
    // manuellement sur la machine host. Sans ca, chaque tentative produisait
    // 6 lignes "FAIL :" sans contexte.
    if (creds.host === '127.0.0.1' || creds.host === 'localhost' || creds.host === '::1') {
      return {
        ok: true,
        messages: ['skipped (host self : ufw doit etre configure manuellement sur la machine host)'],
      };
    }
    // `sudo -n` (non-interactif) : si pas de sudoers NOPASSWD on echoue
    // proprement plutot que d'attendre un prompt qui ne viendra jamais.
    const cmds = [
      'sudo -n ufw default deny incoming',
      'sudo -n ufw default allow outgoing',
      'sudo -n ufw allow 22/tcp',
      'sudo -n ufw allow 80/tcp',
      'sudo -n ufw allow 443/tcp',
      'sudo -n ufw --force enable',
    ];
    const messages: string[] = [];
    let ok = true;
    for (const cmd of cmds) {
      const r = await this.ssh.exec(creds, `${cmd} 2>&1`);
      messages.push(`${cmd} -> ${r.code === 0 ? 'OK' : 'FAIL'} : ${(r.stdout || r.stderr).trim() || '(no output)'}`);
      if (r.code !== 0) ok = false;
    }
    return { ok, messages };
  }
}

export const UFW_SERVICE = Symbol.for('UFWService');

// --- Parser ---

function parseUfwStatus(out: string): UfwStatus {
  const enabled = /Status:\s*active/i.test(out);
  const defaultPolicy = {
    incoming: extract(out, /Default:\s*([a-z]+)\s*\(incoming\)/i) ?? 'unknown',
    outgoing: extract(out, /Default:\s*[a-z]+\s*\(incoming\),\s*([a-z]+)\s*\(outgoing\)/i) ?? 'unknown',
    routed: extract(out, /,\s*([a-z]+)\s*\(routed\)/i) ?? 'unknown',
  };
  const rules: UfwRule[] = [];
  // Lignes du type : "[ 1] 22/tcp                     ALLOW IN    Anywhere"
  for (const line of out.split('\n')) {
    const m = line.match(/^\s*\[\s*(\d+)\s*\]\s+(.+?)\s+(ALLOW|DENY|REJECT|LIMIT)\s+(?:IN\s+|OUT\s+)?(.+?)\s*$/);
    if (!m) continue;
    rules.push({
      index: parseInt(m[1]!, 10),
      target: m[2]!.trim(),
      action: m[3] as UfwRule['action'],
      source: m[4]!.trim(),
      raw: line.trim(),
    });
  }
  return { enabled, defaultPolicy, rules, raw: out };
}

function extract(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? m[1]! : null;
}
