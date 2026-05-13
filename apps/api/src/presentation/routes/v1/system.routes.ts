import { Router } from 'express';
import { container } from '../../../container';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { tenantGuard, getOrgId } from '../../middleware/tenantGuard';
import { LoyaltyConfigService } from '../../../application/services/LoyaltyConfigService';

/**
 * Phase 4.5 — endpoints "system" exposes au frontend tenant pour gerer les updates.
 *
 * Le tenant ne parle pas directement a l'orchestrator (qui est isole sur le control
 * plane et auth via super-admins ops). On proxy : tenant API <-> orchestrator via
 * un service token partage (`OPS_TENANT_PROXY_TOKEN`) injecte au provisioning.
 *
 * Auth : admin du tenant uniquement (ce sont ses settings systeme).
 */

const router = Router();

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://orchestrator:4020';
const SERVICE_TOKEN = process.env.OPS_TENANT_PROXY_TOKEN ?? '';

router.use(authenticate, tenantGuard, authorize('SUPER_ADMIN', 'ADMIN'));

router.get('/updates', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const url = `${ORCHESTRATOR_URL}/ops/tenant-system/updates?tenantId=${encodeURIComponent(orgId)}`;
    const r = await fetch(url, {
      headers: { 'X-Service-Token': SERVICE_TOKEN },
    });
    if (!r.ok) {
      return res.status(502).json({ success: false, message: 'Orchestrator unreachable' });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/updates/apply', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const { toVersion, scheduledFor } = req.body as { toVersion?: string; scheduledFor?: string };
    if (!toVersion) {
      return res.status(400).json({ success: false, message: 'toVersion requis' });
    }
    const url = `${ORCHESTRATOR_URL}/ops/tenants/${orgId}/updates`;
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': SERVICE_TOKEN,
        // En proxy, on indique que la demande vient du tenant_owner
      },
      body: JSON.stringify({ toVersion, scheduledFor, triggeredBy: 'tenant_owner' }),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/updates/:jobId/rollback', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const url = `${ORCHESTRATOR_URL}/ops/tenants/${orgId}/updates/${req.params.jobId}/rollback`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'X-Service-Token': SERVICE_TOKEN },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Studio "self" (modules, domaine custom, politique update, pin)
// Proxy vers l'orchestrator (qui est seul detenteur de ces champs car ils
// pilotent le provisioning et Caddy). Les couleurs/logo restent dans la DB
// tenant via PATCH /organization/branding (les deux peuvent diverger ; le
// frontend tenant doit gerer la double sync s'il veut un alignement strict).
// ============================================================

router.get('/studio', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const r = await fetch(
      `${ORCHESTRATOR_URL}/ops/tenant-self/studio?tenantId=${encodeURIComponent(orgId)}`,
      { headers: { 'X-Service-Token': SERVICE_TOKEN } },
    );
    if (!r.ok) {
      return res.status(502).json({ success: false, message: 'Orchestrator unreachable' });
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.patch('/studio', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const r = await fetch(
      `${ORCHESTRATOR_URL}/ops/tenant-self/studio?tenantId=${encodeURIComponent(orgId)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Token': SERVICE_TOKEN,
        },
        body: JSON.stringify(req.body ?? {}),
      },
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Messagerie (proxy vers l'orchestrator)
// Le tenant owner pilote l'envoi (Resend) + a terme la reception (Mailcow)
// sans avoir de compte ops-admin. Service token uniquement.
// ============================================================

router.get('/mail', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const r = await fetch(
      `${ORCHESTRATOR_URL}/ops/tenant-self/mail?tenantId=${encodeURIComponent(orgId)}`,
      { headers: { 'X-Service-Token': SERVICE_TOKEN } },
    );
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/mail/provision', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const r = await fetch(`${ORCHESTRATOR_URL}/ops/tenant-self/mail/provision?tenantId=${encodeURIComponent(orgId)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Token': SERVICE_TOKEN,
      },
      body: JSON.stringify(req.body ?? {}),
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/mail/verify', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const r = await fetch(`${ORCHESTRATOR_URL}/ops/tenant-self/mail/verify?tenantId=${encodeURIComponent(orgId)}`, {
      method: 'POST',
      headers: { 'X-Service-Token': SERVICE_TOKEN },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/mail/refresh', async (req, res, next) => {
  try {
    const orgId = getOrgId(req);
    const r = await fetch(`${ORCHESTRATOR_URL}/ops/tenant-self/mail/refresh?tenantId=${encodeURIComponent(orgId)}`, {
      method: 'POST',
      headers: { 'X-Service-Token': SERVICE_TOKEN },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    next(err);
  }
});

// ============================================================
// Politique de fidelite (admin uniquement)
// ============================================================

router.get('/loyalty-config', async (req, res, next) => {
  try {
    const svc = container.resolve(LoyaltyConfigService);
    const cfg = await svc.get(getOrgId(req));
    res.json({ success: true, data: cfg });
  } catch (err) {
    next(err);
  }
});

router.put('/loyalty-config', async (req, res, next) => {
  try {
    const svc = container.resolve(LoyaltyConfigService);
    const cfg = await svc.update(getOrgId(req), req.body ?? {});
    res.json({ success: true, data: cfg });
  } catch (err) {
    next(err);
  }
});

export default router;
