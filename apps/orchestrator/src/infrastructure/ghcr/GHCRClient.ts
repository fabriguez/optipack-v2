import { injectable } from 'tsyringe';
import { config } from '../../config';
import { logger } from '../logger';

/**
 * Client minimaliste pour GHCR. Liste les tags d'une image privee.
 *
 * GHCR utilise l'API standard OCI Distribution :
 *  GET https://ghcr.io/v2/<namespace>/<image>/tags/list
 *
 * Auth : Bearer token (un PAT GitHub avec scope read:packages, ou un token derive).
 *
 * Strategie : on poll toutes les heures. Quand un tag semver inconnu apparait,
 * on cree un record Release status=unpublished. Le super-admin decide ensuite de publier.
 */

interface TagListResponse {
  name: string;
  tags: string[];
}

@injectable()
export class GHCRClient {
  private readonly base = 'https://ghcr.io/v2';

  isConfigured(): boolean {
    return !!config.ghcr.pullToken;
  }

  /**
   * Pour GHCR, deux schemas d'auth marchent :
   *  - "Bearer <base64(PAT)>"   (le plus simple, documente par GitHub)
   *  - "Basic  <base64(user:PAT)>"  (fallback compatibles registry standards)
   * On essaie le premier ; si 401, on retombe sur le Basic.
   */
  private encodedPat(): string {
    return Buffer.from(config.ghcr.pullToken, 'utf-8').toString('base64');
  }
  private basicAuth(): string {
    const u = process.env.OPS_GHCR_USERNAME ?? config.ghcr.namespace;
    return Buffer.from(`${u}:${config.ghcr.pullToken}`, 'utf-8').toString('base64');
  }

  async listTags(image: string): Promise<string[]> {
    if (!this.isConfigured()) {
      logger.warn('[ghcr] non configure (OPS_GHCR_TOKEN manquant)');
      return [];
    }

    const url = `${this.base}/${config.ghcr.namespace}/${image}/tags/list`;
    const headers = (auth: string) => ({
      Authorization: auth,
      Accept: 'application/json',
    });

    // Pagination OCI : on suit les Link headers pour recuperer tous les tags
    // (ghcr renvoie 100 max par defaut). Sans ca, on rate les anciens tags.
    const all: string[] = [];
    let next: string | null = url;
    let authHeader = `Bearer ${this.encodedPat()}`;
    let triedFallback = false;

    while (next) {
      try {
        const res: Response = await fetch(next, { headers: headers(authHeader) });
        if (res.status === 401 && !triedFallback) {
          // bascule Basic auth (PAT + username)
          authHeader = `Basic ${this.basicAuth()}`;
          triedFallback = true;
          continue;
        }
        if (!res.ok) {
          logger.warn(
            { status: res.status, image, url: next, statusText: res.statusText },
            '[ghcr] listTags failed',
          );
          return all;
        }
        const data = (await res.json()) as TagListResponse;
        if (data.tags?.length) all.push(...data.tags);
        // Lien vers la page suivante (OCI distribution spec : Link header rel=next)
        const link = res.headers.get('link');
        const m = link?.match(/<([^>]+)>;\s*rel="?next"?/i);
        next = m ? new URL(m[1], 'https://ghcr.io').toString() : null;
      } catch (e) {
        logger.warn(
          { err: e instanceof Error ? e.message : String(e), image },
          '[ghcr] listTags error',
        );
        return all;
      }
    }

    logger.info({ image, count: all.length }, '[ghcr] listTags ok');
    return all;
  }

  /**
   * Filtre les tags : retient toute reference contenant une version semver.
   * Accepte :
   *  - "1.4.2", "2.0.0-beta1"            (semver pur)
   *  - "beta-1.0.34", "rc-2.1.0"         (prefixe channel + version)
   *  - "v1.2.3"                          (prefixe v classique)
   *  - "1.0.0-pre.42+build.7"            (avec pre-release et metadata)
   * Rejette :
   *  - "latest", "main", "edge"          (refs flottantes)
   *  - "previous-<slug>"                 (snapshot interne de rollback)
   */
  filterSemverTags(tags: string[]): string[] {
    const re = /\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?/;
    const blocklist = /^(latest|main|edge|preview|previous(?:-|$)|tmp-)/i;
    return tags.filter((t) => re.test(t) && !blocklist.test(t));
  }
}
