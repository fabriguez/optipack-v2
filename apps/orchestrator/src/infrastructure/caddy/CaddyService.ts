import { inject, injectable } from 'tsyringe';
import { SSHService, SSH_SERVICE, type SshConnection } from '../ssh/SSHService';

/**
 * Pilote Caddy via son admin API (`localhost:2019` sur le VPS).
 *
 * Strategie : on garde un fichier `Caddyfile.json` source de verite sur le VPS
 * (dans `/etc/caddy/auto.json`) qu'on regenere a chaque modification, puis on
 * fait `curl -X POST localhost:2019/load -d @auto.json`.
 *
 * L'avantage de la full-replace via /load : on ne risque pas de laisser des
 * routes orphelines sur Caddy si une operation partielle echoue.
 *
 * Le fichier de base est genere depuis nos records `Tenant`.
 */

export interface TenantCaddyEntry {
  slug: string;
  customDomain?: string | null;
  apiPort: number;
  webPort: number;
  /** Port du conteneur web-client (site public + portail). Optionnel pour
   *  retrocompatibilite avec les tenants pre-Phase web-client. */
  webClientPort?: number;
  isFrozen: boolean;
}

interface BuildOptions {
  baseDomain: string; // ex: "transitsoftservices.com"
  email: string; // pour Let's Encrypt
}

@injectable()
export class CaddyService {
  constructor(@inject(SSH_SERVICE) private ssh: SSHService) {}

  /**
   * Genere la config JSON Caddy pour la liste de tenants donnee.
   * Format : https://caddyserver.com/docs/json/
   */
  buildConfig(tenants: TenantCaddyEntry[], opts: BuildOptions): unknown {
    const routes: unknown[] = [];
    const FROZEN_RESPONSE = {
      handler: 'static_response',
      status_code: 503,
      headers: { 'Content-Type': ['text/html; charset=utf-8'] },
      body: '<h1>Service suspendu</h1><p>Votre abonnement a expire. Contactez le support.</p>',
    };

    for (const t of tenants) {
      // staff dashboard : {slug}.{base} (retrocompat)
      // public site (web-client) : www.{slug}.{base} + custom domain
      // api : api.{slug}.{base}
      const staffHosts: string[] = [`${t.slug}.${opts.baseDomain}`];
      const publicHosts: string[] = [`www.${t.slug}.${opts.baseDomain}`];
      if (t.customDomain) publicHosts.push(t.customDomain);
      const apiHost = `api.${t.slug}.${opts.baseDomain}`;

      const webBackend = t.isFrozen ? FROZEN_RESPONSE : {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${t.webPort}` }],
      };

      const webClientBackend = t.isFrozen
        ? FROZEN_RESPONSE
        : t.webClientPort
        ? {
            handler: 'reverse_proxy',
            upstreams: [{ dial: `localhost:${t.webClientPort}` }],
          }
        : null;

      const apiBackend = t.isFrozen ? FROZEN_RESPONSE : {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${t.apiPort}` }],
      };

      // Staff dashboard (slug.base)
      routes.push({
        match: [{ host: staffHosts }],
        handle: [{ handler: 'subroute', routes: [{ handle: [webBackend] }] }],
        terminal: true,
      });

      // Public website + portal (www.slug.base + customDomain)
      // Si le tenant n'a pas encore de web-client (legacy), on fallback sur le web staff.
      routes.push({
        match: [{ host: publicHosts }],
        handle: [
          {
            handler: 'subroute',
            routes: [{ handle: [webClientBackend ?? webBackend] }],
          },
        ],
        terminal: true,
      });

      // API
      routes.push({
        match: [{ host: [apiHost] }],
        handle: [{ handler: 'subroute', routes: [{ handle: [apiBackend] }] }],
        terminal: true,
      });
    }

    return {
      // Phase 5 #10 — Caddy admin API durcie :
      //   - bind localhost:2019 uniquement (jamais expose hors VPS)
      //   - origins allowlist : seul `localhost` est tolere comme Host header
      //   - enforce_origin : refuse les requetes avec un Host non-whitelist (anti DNS-rebinding)
      admin: {
        listen: 'localhost:2019',
        origins: ['localhost', '127.0.0.1', '[::1]'],
        enforce_origin: true,
      },
      apps: {
        http: {
          servers: {
            srv0: {
              listen: [':443'],
              routes,
              automatic_https: { disable: false },
            },
            srv_http: {
              listen: [':80'],
              routes: [
                {
                  handle: [{ handler: 'static_response', status_code: 308, headers: { Location: ['https://{http.request.host}{http.request.uri}'] } }],
                },
              ],
            },
          },
        },
        tls: {
          automation: {
            policies: [{ issuers: [{ module: 'acme', email: opts.email }] }],
          },
        },
      },
    };
  }

  /**
   * Push la config Caddy sur un VPS.
   * Strategie : ecrit dans /tmp/caddy-tenants.json puis curl POST localhost:2019/load
   */
  async push(creds: SshConnection, configJson: unknown): Promise<void> {
    const json = JSON.stringify(configJson);
    // Echappement single-quote pour heredoc bash
    const escaped = json.replace(/'/g, "'\\''");
    const cmd = `cat > /tmp/caddy-tenants.json <<'EOF'\n${escaped}\nEOF\ncurl -fsSL -X POST -H "Content-Type: application/json" --data-binary @/tmp/caddy-tenants.json http://localhost:2019/load`;
    const r = await this.ssh.exec(creds, cmd);
    if (r.code !== 0) {
      throw new Error(`Caddy /load a echoue : ${r.stderr || r.stdout}`);
    }
  }
}

export const CADDY_SERVICE = Symbol.for('CaddyService');
