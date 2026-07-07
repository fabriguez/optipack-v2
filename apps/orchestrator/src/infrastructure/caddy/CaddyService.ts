import { inject, injectable } from 'tsyringe';
import { readFile, writeFile, mkdir, readdir, unlink } from 'fs/promises';
import { dirname, join } from 'path';
import { SSHService, SSH_SERVICE, type SshConnection } from '../ssh/SSHService';
import { logger } from '../logger';
import {
  type TenantCaddyEntry,
  type BuildOptions,
  parseStaticRoutes,
  renderManagedRegion,
  collectManagedHosts,
  mergeManagedRegion,
} from './caddyfile';

export type { TenantCaddyEntry, BuildOptions } from './caddyfile';

/**
 * Pilote la config Caddy de chaque VPS.
 *
 * Deux topologies :
 *  - **self** (host principal) : Caddy natif systemd, lit `/etc/caddy/Caddyfile`
 *    au boot. Le conteneur orchestrateur y accede via un **bind-mount**
 *    (`/etc/caddy` monte dans le conteneur) : il lit/merge/ecrit le fichier
 *    directement (root conteneur = root host sur le bind, donc PAS de sudo),
 *    puis recharge via l'admin API (`host.docker.internal:2019`).
 *  - **VPS distant** : Caddy en conteneur, lit `~/.optipack/caddy/Caddyfile`
 *    (monte dans le conteneur caddy). L'orchestrateur y accede par SSH.
 *
 * Dans les deux cas la SOURCE DE VERITE est un **fichier Caddyfile sur disque**
 * -> survit au restart de Caddy. On ne regenere que la region delimitee par les
 * marqueurs `OPTIPACK-MANAGED` (cf. caddyfile.ts) ; les blocs manuels (whatsapp,
 * domaines perso...) sont preserves. Validation via `/adapt` + backup date avant
 * chaque ecriture -> rollback possible.
 */

const SELF_VPS_NAME = process.env.OPS_SELF_VPS_NAME ?? 'self';
/** Chemin du Caddyfile du host self, tel que monte dans le conteneur. */
const SELF_CADDYFILE = process.env.CADDY_SELF_FILE ?? '/etc/caddy/Caddyfile';
/** Chemin du Caddyfile sur les VPS distants (monte dans le conteneur caddy). */
const REMOTE_CADDYFILE = '$HOME/.optipack/caddy/Caddyfile';
const BACKUP_KEEP = 10;

interface VpsTarget extends SshConnection {
  name: string;
}

@injectable()
export class CaddyService {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  /**
   * Point d'entree unique : applique la config Caddy du VPS a partir de la
   * liste de tenants (merge dans le Caddyfile existant, conserve les blocs
   * manuels). Route self -> local (mount+API), distant -> SSH.
   */
  async applyForVps(
    vps: VpsTarget,
    entries: TenantCaddyEntry[],
    opts: BuildOptions,
    at: Date,
  ): Promise<void> {
    if (vps.name === SELF_VPS_NAME) {
      await this.applyLocal(entries, opts, at);
    } else {
      await this.applyRemote(vps, entries, opts, at);
    }
  }

  // -------------------------------------------------------------------------
  // Self : bind-mount + admin API
  // -------------------------------------------------------------------------

  private async applyLocal(
    entries: TenantCaddyEntry[],
    opts: BuildOptions,
    at: Date,
  ): Promise<void> {
    const statics = parseStaticRoutes(opts.baseDomain);
    const region = renderManagedRegion(entries, opts, statics, at);
    const managed = collectManagedHosts(entries, opts.baseDomain, statics);

    const existing = await this.readFileSafe(SELF_CADDYFILE);
    const merged = mergeManagedRegion(existing, region, managed);

    // 1. Valide AVANT toute ecriture (aucun effet de bord).
    await this.adminPost('/adapt', merged);

    // 2. Backup date de l'ancien contenu (best-effort).
    if (existing) await this.backupLocal(SELF_CADDYFILE, existing, at);

    // 3. Ecrit le fichier (source de verite, survit au restart).
    await writeFile(SELF_CADDYFILE, merged, 'utf8');

    // 4. Recharge en live via l'admin API.
    try {
      await this.adminPost('/load', merged);
    } catch (err) {
      // Rollback : on remet l'ancien fichier + on tente de le recharger.
      if (existing) {
        await writeFile(SELF_CADDYFILE, existing, 'utf8').catch(() => {});
        await this.adminPost('/load', existing).catch(() => {});
      }
      throw err;
    }
  }

  private async readFileSafe(path: string): Promise<string> {
    try {
      return await readFile(path, 'utf8');
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return '';
      throw err;
    }
  }

  private async backupLocal(file: string, content: string, at: Date): Promise<void> {
    try {
      const dir = join(dirname(file), 'backups');
      await mkdir(dir, { recursive: true });
      const ts = at.toISOString().replace(/[:.]/g, '-');
      await writeFile(join(dir, `Caddyfile.${ts}`), content, 'utf8');
      // Purge : garde les BACKUP_KEEP plus recents.
      const names = (await readdir(dir))
        .filter((n) => n.startsWith('Caddyfile.'))
        .sort()
        .reverse();
      for (const stale of names.slice(BACKUP_KEEP)) {
        await unlink(join(dir, stale)).catch(() => {});
      }
    } catch (err) {
      logger.warn({ err: String(err) }, '[caddy] backup local non critique a echoue');
    }
  }

  /** Candidats pour joindre l'admin API Caddy depuis le conteneur orchestrateur. */
  private adminUrls(): string[] {
    const candidates: string[] = [];
    if (process.env.CADDY_ADMIN_URL) candidates.push(process.env.CADDY_ADMIN_URL);
    candidates.push(
      'http://host.docker.internal:2019',
      'http://172.17.0.1:2019',
      'http://172.18.0.1:2019',
      'http://172.19.0.1:2019',
      'http://172.20.0.1:2019',
    );
    const seen = new Set<string>();
    return candidates.filter((u) => (seen.has(u) ? false : seen.add(u)));
  }

  /**
   * POST un Caddyfile texte a l'admin API (`/adapt` pour valider, `/load` pour
   * appliquer). Essaie les URLs candidates (bridge Docker) jusqu'a une reponse
   * HTTP. Une reponse HTTP non-2xx = bon host mais config invalide -> on remonte
   * l'erreur reelle sans masquer.
   */
  private async adminPost(path: '/adapt' | '/load', caddyfileText: string): Promise<void> {
    // enforce_origin : http://localhost est toujours accepte par Caddy.
    const origin = process.env.CADDY_ADMIN_ORIGIN ?? 'http://localhost';
    const errors: string[] = [];
    for (const url of this.adminUrls()) {
      try {
        const res = await fetch(`${url}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'text/caddyfile', Origin: origin },
          body: caddyfileText,
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return;
        const t = await res.text().catch(() => '');
        throw new Error(`(${res.status}) ${t.slice(0, 300)}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${url}${path} -> ${msg}`);
        if (/^\(\d{3}\)/.test(msg)) {
          throw new Error(`Caddy admin ${path} a echoue : ${msg}`);
        }
        // ECONNREFUSED / timeout / DNS -> URL suivante
      }
    }
    throw new Error(`Caddy admin ${path} injoignable. Tentatives :\n  ${errors.join('\n  ')}`);
  }

  // -------------------------------------------------------------------------
  // VPS distant : SSH (Caddy conteneur)
  // -------------------------------------------------------------------------

  private async applyRemote(
    creds: SshConnection,
    entries: TenantCaddyEntry[],
    opts: BuildOptions,
    at: Date,
  ): Promise<void> {
    const statics = parseStaticRoutes(opts.baseDomain);
    const region = renderManagedRegion(entries, opts, statics, at);
    const managed = collectManagedHosts(entries, opts.baseDomain, statics);

    // 1. Lit le Caddyfile courant + verifie que le conteneur caddy tourne.
    const probe = await this.ssh.exec(creds, this.probeScript());
    if (probe.code !== 0) {
      throw new Error(`Caddy probe SSH a echoue : ${(probe.stderr || probe.stdout).trim()}`);
    }
    if (probe.stdout.includes('NO_CADDY')) {
      throw new Error(
        'Conteneur caddy introuvable sur le VPS : (re)lancer le bootstrap VPS avant de reconcilier.',
      );
    }
    const existing = this.extractBetween(probe.stdout, '---CF-BEGIN---', '---CF-END---');
    const merged = mergeManagedRegion(existing, region, managed);

    // 2. Valide + backup + ecrit + reload (rollback si reload KO), cote VPS.
    const ts = at.toISOString().replace(/[:.]/g, '-');
    const apply = await this.ssh.exec(creds, this.applyScript(merged, ts));
    if (apply.code !== 0 || !apply.stdout.includes('CADDY_OK')) {
      throw new Error(
        `Caddy apply SSH a echoue (${apply.code}) : ${(apply.stderr || apply.stdout).trim().slice(0, 400)}`,
      );
    }
  }

  private probeScript(): string {
    return [
      `set -e`,
      `if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx caddy; then echo NO_CADDY; exit 0; fi`,
      `mkdir -p "$HOME/.optipack/caddy"`,
      `echo ---CF-BEGIN---`,
      `cat ${REMOTE_CADDYFILE} 2>/dev/null || true`,
      `echo ---CF-END---`,
    ].join('\n');
  }

  private applyScript(content: string, ts: string): string {
    // Heredoc quote (<<'EOF') => contenu litteral, aucune expansion shell.
    const EOF = 'OPTIPACK_CADDY_EOF_9f3a2b';
    return [
      `set -e`,
      `D="$HOME/.optipack/caddy"; F="$D/Caddyfile"; BK="$D/backups"; TS="${ts}"`,
      `mkdir -p "$D" "$BK"`,
      `TMP="$(mktemp)"`,
      `cat > "$TMP" <<'${EOF}'`,
      content,
      EOF,
      `# 1. valide dans un conteneur ephemere`,
      `if ! docker run --rm -v "$TMP":/tmp/cf:ro caddy:2-alpine caddy validate --adapter caddyfile --config /tmp/cf >/dev/null 2>&1; then echo CADDY_VALIDATE_FAILED; rm -f "$TMP"; exit 3; fi`,
      `# 2. backup date de l'existant`,
      `[ -f "$F" ] && cp "$F" "$BK/Caddyfile.$TS" 2>/dev/null || true`,
      `# 3. ecrit la nouvelle config (source de verite, survit au restart)`,
      `cp "$TMP" "$F"`,
      `# 4. reload live`,
      `if ! docker exec caddy caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1; then`,
      `  echo CADDY_LOAD_FAILED_ROLLBACK`,
      `  if [ -f "$BK/Caddyfile.$TS" ]; then cp "$BK/Caddyfile.$TS" "$F"; docker exec caddy caddy reload --adapter caddyfile --config /etc/caddy/Caddyfile >/dev/null 2>&1 || true; fi`,
      `  rm -f "$TMP"; exit 4`,
      `fi`,
      `# 5. purge : garde les ${BACKUP_KEEP} backups les plus recents`,
      `ls -1t "$BK"/Caddyfile.* 2>/dev/null | tail -n +${BACKUP_KEEP + 1} | xargs -r rm -f`,
      `rm -f "$TMP"; echo CADDY_OK`,
    ].join('\n');
  }

  private extractBetween(text: string, begin: string, end: string): string {
    const i = text.indexOf(begin);
    if (i < 0) return '';
    const start = i + begin.length;
    const j = text.indexOf(end, start);
    const slice = j < 0 ? text.slice(start) : text.slice(start, j);
    return slice.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  }
}

export const CADDY_SERVICE = Symbol.for('CaddyService');
