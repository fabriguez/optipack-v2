import { injectable } from 'tsyringe';
import { config } from '../../config';
import { logger } from '../logger';

/**
 * Client Resend pour la gestion multi-tenant des domaines d'envoi.
 *
 * Resend API : https://resend.com/docs/api-reference
 *
 * Auth : Bearer <RESEND_API_KEY> (1 cle par compte Resend, secret global).
 * Pas besoin d'un compte/cle par tenant : on cree juste 1 domaine par tenant,
 * et chaque tenant peut envoyer via le SDK avec son "from: x@<sa-domaine>".
 */

export interface ResendDnsRecord {
  type: 'MX' | 'TXT' | 'CNAME';
  name: string;
  value: string;
  status?: 'pending' | 'verified' | 'failed' | 'not_started';
  ttl?: string | number;
  priority?: number;
}

export interface ResendDomain {
  id: string;
  name: string;
  status: 'pending' | 'verified' | 'failed' | 'not_started' | string;
  region: string;
  records: ResendDnsRecord[];
  createdAt: string;
}

@injectable()
export class ResendClient {
  private readonly base = 'https://api.resend.com';

  isConfigured(): boolean {
    return !!config.resend.apiKey;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${config.resend.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * POST /domains
   * Cree un nouveau domaine d'envoi pour ce compte Resend.
   * Le domaine peut etre un apex (acme.com) ou un sous-domaine (mail.acme.com).
   * Resend renvoie immediatement les records DNS a configurer pour valider.
   */
  async createDomain(name: string): Promise<ResendDomain> {
    if (!this.isConfigured()) {
      throw new Error('Resend non configure (RESEND_API_KEY manquant)');
    }
    const res = await fetch(`${this.base}/domains`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ name, region: config.resend.region }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend createDomain ${res.status}: ${body || res.statusText}`);
    }
    const data = (await res.json()) as Record<string, unknown>;
    logger.info({ name, id: data.id, status: data.status }, '[resend] domain created');
    return this.toDomain(data);
  }

  /**
   * GET /domains/{id}
   * Lit l'etat courant + les DNS records. Status repasse de "pending" a
   * "verified" quand l'utilisateur a propage ses records DNS.
   */
  async getDomain(id: string): Promise<ResendDomain> {
    if (!this.isConfigured()) {
      throw new Error('Resend non configure');
    }
    const res = await fetch(`${this.base}/domains/${id}`, { headers: this.headers() });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend getDomain ${res.status}: ${body || res.statusText}`);
    }
    return this.toDomain(await res.json());
  }

  /**
   * POST /domains/{id}/verify
   * Force Resend a relire le DNS et a passer le domaine en "verified" si tout
   * est OK. Idempotent : on peut l'appeler plusieurs fois.
   */
  async verifyDomain(id: string): Promise<ResendDomain> {
    if (!this.isConfigured()) {
      throw new Error('Resend non configure');
    }
    const res = await fetch(`${this.base}/domains/${id}/verify`, {
      method: 'POST',
      headers: this.headers(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Resend verifyDomain ${res.status}: ${body || res.statusText}`);
    }
    // Resend renvoie souvent juste { id, status } -- on re-fetch les details complets.
    return this.getDomain(id);
  }

  /**
   * DELETE /domains/{id}
   * Supprime le domaine de Resend. Utile a l'archivage d'un tenant.
   */
  async deleteDomain(id: string): Promise<void> {
    if (!this.isConfigured()) return;
    const res = await fetch(`${this.base}/domains/${id}`, {
      method: 'DELETE',
      headers: this.headers(),
    });
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => '');
      logger.warn({ id, status: res.status, body }, '[resend] deleteDomain failed');
    }
  }

  /**
   * Normalise la reponse de Resend en SkinDomain (l'API renvoie parfois
   * `records` ou `dns_records` selon la version).
   */
  private toDomain(data: any): ResendDomain {
    const records: ResendDnsRecord[] = (data.records ?? data.dns_records ?? []).map(
      (r: any): ResendDnsRecord => ({
        type: r.type ?? r.record_type ?? 'TXT',
        name: r.name ?? r.host ?? '',
        value: r.value ?? r.content ?? '',
        status: r.status ?? undefined,
        ttl: r.ttl ?? 'auto',
        priority: r.priority ?? undefined,
      }),
    );
    return {
      id: data.id,
      name: data.name,
      status: data.status ?? 'pending',
      region: data.region ?? config.resend.region,
      records,
      createdAt: data.created_at ?? data.createdAt ?? new Date().toISOString(),
    };
  }
}

export const RESEND_CLIENT = Symbol.for('ResendClient');
