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
      const hosts: string[] = [`${t.slug}.${opts.baseDomain}`];
      const apiHost = `api.${t.slug}.${opts.baseDomain}`;
      const customHosts: string[] = t.customDomain ? [t.customDomain] : [];

      const webBackend = t.isFrozen ? FROZEN_RESPONSE : {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${t.webPort}` }],
      };

      const apiBackend = t.isFrozen ? FROZEN_RESPONSE : {
        handler: 'reverse_proxy',
        upstreams: [{ dial: `localhost:${t.apiPort}` }],
      };

      // Web (sous-domaine + custom domain si fourni)
      routes.push({
        match: [{ host: [...hosts, ...customHosts] }],
        handle: [{ handler: 'subroute', routes: [{ handle: [webBackend] }] }],
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
      admin: { listen: 'localhost:2019' },
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
