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
  /** Tenant principal du proprietaire : schema d'URL plat (app.{base}, www.{base},
   *  api.{base} + apex) au lieu du pattern slug habituel. */
  isMain?: boolean;
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
      // Schema symetrique entre tenant principal et les autres :
      //   public (web-client) -> bare apex/slug + www. + customDomain
      //   staff  (dashboard)  -> app.{base | slug.base}
      //   api                 -> api.{base | slug.base}
      //
      // Tenant principal :
      //   transitsoftservices.com / www.transitsoftservices.com  -> public
      //   app.transitsoftservices.com                            -> staff
      //   api.transitsoftservices.com                            -> api
      //
      // Tenant `acme` :
      //   acme.transitsoftservices.com / www.acme.transitsoftservices.com / customDomain -> public
      //   app.acme.transitsoftservices.com  -> staff
      //   api.acme.transitsoftservices.com  -> api
      const publicHosts: string[] = t.isMain
        ? [opts.baseDomain, `www.${opts.baseDomain}`]
        : [`${t.slug}.${opts.baseDomain}`, `www.${t.slug}.${opts.baseDomain}`];
      if (t.customDomain) publicHosts.push(t.customDomain);

      const staffHosts: string[] = t.isMain
        ? [`app.${opts.baseDomain}`]
        : [`app.${t.slug}.${opts.baseDomain}`];

      const apiHost = t.isMain
        ? `api.${opts.baseDomain}`
        : `api.${t.slug}.${opts.baseDomain}`;

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

    // Routes statiques additionnelles (ops-admin, orchestrator API, monitoring...).
    // Format env :  CADDY_STATIC_ROUTES="host1=127.0.0.1:port1,host2=127.0.0.1:port2"
    // Defauts :
    //   ops.{base}       -> orchestrator API (port 4020 expose en 127.0.0.1)
    //   ops-admin.{base} -> dashboard ops-admin Next.js (port 3020)
    // Note : Caddy tourne sur l'host donc utilise 127.0.0.1, PAS host.docker.internal
    // (qui n'a de sens que pour un client a l'interieur d'un conteneur).
    const staticDefault = [
      `ops.${opts.baseDomain}=127.0.0.1:4020`,
      `ops-admin.${opts.baseDomain}=127.0.0.1:3020`,
    ].join(',');
    const staticRaw = process.env.CADDY_STATIC_ROUTES ?? staticDefault;
    for (const entry of staticRaw.split(',').map((s) => s.trim()).filter(Boolean)) {
      const eq = entry.indexOf('=');
      if (eq < 0) continue;
      const host = entry.slice(0, eq).trim();
      const upstream = entry.slice(eq + 1).trim();
      if (!host || !upstream) continue;
      routes.push({
        match: [{ host: [host] }],
        handle: [
          {
            handler: 'subroute',
            routes: [
              {
                handle: [
                  {
                    handler: 'reverse_proxy',
                    upstreams: [{ dial: upstream }],
                  },
                ],
              },
            ],
          },
        ],
        terminal: true,
      });
    }

    // Bloc admin = doit rester atteignable apres ce push, sinon les push
    // suivants echouent (admin = full replace, pas merge).
    // Defauts pour bridge mode (orchestrator conteneur sur network compose) :
    //   - listen 0.0.0.0:2019 sur l'host : joignable depuis n'importe quel
    //     Docker bridge (et UFW bloque 2019 vers internet)
    //   - origins large : orchestrator + tous les bridges Docker usuels + localhost
    // Overridable via CADDY_ADMIN_LISTEN / CADDY_ADMIN_ORIGINS.
    const adminListen = process.env.CADDY_ADMIN_LISTEN ?? '0.0.0.0:2019';
    const adminOriginsRaw =
      process.env.CADDY_ADMIN_ORIGINS ??
      'orchestrator,host.docker.internal,localhost,127.0.0.1,172.17.0.1,172.18.0.1,172.19.0.1,172.20.0.1';
    const adminOrigins = adminOriginsRaw
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    return {
      admin: {
        listen: adminListen,
        origins: adminOrigins,
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
   * Push la config Caddy sur un VPS distant via SSH.
   * Strategie : ecrit dans /tmp/caddy-tenants.json puis curl POST localhost:2019/load
   */
  async push(creds: SshConnection, configJson: unknown): Promise<void> {
    const json = JSON.stringify(configJson);
    // Echappement single-quote pour heredoc bash
    const escaped = json.replace(/'/g, "'\\''");
    // push() SSHe dans le VPS et lance curl DEPUIS l'host. L'host est
    // toujours dans les origines autorisees par defaut de Caddy (localhost).
    // On n'utilise PAS http://orchestrator ici : ce serait le nom du conteneur
    // Docker, qui n'est pas reconnu par Caddy natif sans config prealable.
    // CADDY_ADMIN_ORIGIN permet de surcharger si le VPS a une config custom.
    const origin = process.env.CADDY_ADMIN_ORIGIN ?? 'http://localhost';
    const cmd = `cat > /tmp/caddy-tenants.json <<'EOF'\n${escaped}\nEOF\ncurl -fsSL -X POST -H "Content-Type: application/json" -H "Origin: ${origin}" --data-binary @/tmp/caddy-tenants.json http://localhost:2019/load`;
    const r = await this.ssh.exec(creds, cmd);
    if (r.code !== 0) {
      throw new Error(`Caddy /load a echoue : ${(r.stderr || r.stdout || '').trim()}`);
    }
  }

  /**
   * Push la config Caddy sur le VPS *local* (le meme que celui qui heberge
   * l'orchestrator). Utilise quand vps.name === 'self' / vps.host est en
   * loopback : pas besoin de SSH, on hit directement l'admin API depuis le
   * conteneur orchestrator.
   *
   * Note : l'admin API Caddy ecoute sur localhost:2019 cote HOST. Pour que le
   * conteneur orchestrator y accede, il faut soit :
   *  - utiliser `host.docker.internal` (Docker Desktop) ou `172.17.0.1` (Linux,
   *    IP par defaut du bridge gateway), configurable via env CADDY_ADMIN_URL.
   *  - ou faire tourner le conteneur orchestrator avec `network_mode: host`
   *    (plus simple sur un VPS Linux mono-machine).
   */
  async pushLocal(configJson: unknown): Promise<void> {
    // Caddy admin API valide l'header Origin et rejette '' avec 403.
    // On utilise http://localhost : toujours dans la liste par defaut de Caddy,
    // meme avant le premier push qui injecte notre liste d'origines elargie.
    // http://orchestrator ne fonctionnerait qu'apres un premier push reussi
    // (bootstrap impossible). CADDY_ADMIN_ORIGIN permet de surcharger.
    const origin = process.env.CADDY_ADMIN_ORIGIN ?? 'http://localhost';
    const body = JSON.stringify(configJson);

    // Bridge mode : on tente host.docker.internal (recommande, mappe via
    // extra_hosts: host-gateway dans le compose), puis les IPs de bridges
    // Docker connus. Fallback automatique.
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
    const urls = candidates.filter((u) => (seen.has(u) ? false : seen.add(u)));

    const errors: string[] = [];
    for (const url of urls) {
      try {
        const res = await fetch(`${url}/load`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: origin },
          body,
          // 5s timeout par tentative pour ne pas bloquer 30s sur une IP hors-route
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return;
        const t = await res.text().catch(() => '');
        // Reponse HTTP (meme erreur) = on est sur le bon host mais probleme
        // de config (origin / payload). On s'arrete pour faire remonter
        // l'erreur reelle, sans masquer par les autres URLs.
        throw new Error(`(${res.status}) ${t.slice(0, 200)}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${url} -> ${msg}`);
        if (/^\(\d{3}\)/.test(msg)) {
          throw new Error(`Caddy local /load a echoue : ${msg}`);
        }
        // ECONNREFUSED / timeout / DNS -> on tente l'URL suivante
      }
    }
    throw new Error(
      `Caddy local /load injoignable. Tentatives :\n  ${errors.join('\n  ')}`,
    );
  }
}

export const CADDY_SERVICE = Symbol.for('CaddyService');
