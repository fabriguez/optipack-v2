import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/authMiddleware';
import { tenantGuard, getOrgId } from '../../middleware/tenantGuard';

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

export default router;
