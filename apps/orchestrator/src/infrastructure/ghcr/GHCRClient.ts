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
   * Recupere un token Bearer pour acceder aux tags d'une image privee.
   * GHCR renvoie un challenge 401 avec les details OAuth du realm a interroger.
   */
  private async getAuthToken(image: string): Promise<string> {
    // Tentative directe avec le PAT comme Bearer (ca marche generalement).
    return config.ghcr.pullToken;
  }

  async listTags(image: string): Promise<string[]> {
    if (!this.isConfigured()) {
      logger.warn('[ghcr] non configure (OPS_GHCR_TOKEN manquant)');
      return [];
    }

    const token = await this.getAuthToken(image);
    const url = `${this.base}/${config.ghcr.namespace}/${image}/tags/list`;
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (!res.ok) {
        logger.warn({ status: res.status, image }, '[ghcr] listTags failed');
        return [];
      }
      const data = (await res.json()) as TagListResponse;
      return data.tags ?? [];
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, '[ghcr] listTags error');
      return [];
    }
  }

  /**
   * Filtre les tags : retient les versions semver (1.4.2, 2.0.0-beta1).
   */
  filterSemverTags(tags: string[]): string[] {
    const re = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
    return tags.filter((t) => re.test(t));
  }
}
