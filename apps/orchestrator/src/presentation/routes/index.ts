import { Router, raw } from 'express';
import { AuthController } from '../controllers/AuthController';
import { VpsController } from '../controllers/VpsController';
import { TenantController } from '../controllers/TenantController';
import { OpsAdminController } from '../controllers/OpsAdminController';
import { AuditController } from '../controllers/AuditController';
import { PlanController } from '../controllers/PlanController';
import { BillingController } from '../controllers/BillingController';
import { ReleaseController } from '../controllers/ReleaseController';
import { BackupController } from '../controllers/BackupController';
import { CaddyController } from '../controllers/CaddyController';
import { authenticateOps, requireSuperAdmin } from '../middleware/authOpsMiddleware';
import { requireServiceToken } from '../middleware/serviceTokenMiddleware';

const router = Router();

// Healthcheck (public)
router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'orchestrator' });
});

// ============================================================
// AUTH (login + 2FA public ; me + logout authentifies)
// ============================================================
router.post('/auth/login', AuthController.login);
router.post('/auth/2fa/setup', AuthController.setupTwoFactor);
router.post('/auth/2fa/confirm', AuthController.confirmTwoFactor);
router.post('/auth/2fa/recovery', AuthController.useRecoveryCode);
router.post('/auth/2fa/recovery/regenerate', authenticateOps, AuthController.regenerateRecoveryCodes);
router.get('/auth/me', authenticateOps, AuthController.me);
router.post('/auth/logout', authenticateOps, AuthController.logout);

// ============================================================
// VPS (auth + super-admin)
// ============================================================
router.get('/vps', authenticateOps, requireSuperAdmin, VpsController.list);
router.post('/vps', authenticateOps, requireSuperAdmin, VpsController.create);
router.get('/vps/:id', authenticateOps, requireSuperAdmin, VpsController.getById);
router.patch('/vps/:id', authenticateOps, requireSuperAdmin, VpsController.update);
router.delete('/vps/:id', authenticateOps, requireSuperAdmin, VpsController.delete);
router.post('/vps/:id/test-connection', authenticateOps, requireSuperAdmin, VpsController.testConnection);
router.get('/vps/:id/usage', authenticateOps, requireSuperAdmin, VpsController.getUsage);
router.get('/vps/:id/capacity', authenticateOps, requireSuperAdmin, BillingController.vpsCapacity);

// ============================================================
// TENANTS (auth ; archive + migrate reserves super-admin)
// ============================================================
router.get('/tenants', authenticateOps, TenantController.list);
router.post('/tenants', authenticateOps, TenantController.create);
router.get('/tenants/:id', authenticateOps, TenantController.getById);
router.patch('/tenants/:id', authenticateOps, TenantController.update);
router.post('/tenants/:id/freeze', authenticateOps, TenantController.freeze);
router.post('/tenants/:id/unfreeze', authenticateOps, TenantController.unfreeze);
router.post('/tenants/:id/archive', authenticateOps, requireSuperAdmin, TenantController.archive);
router.post('/tenants/:id/migrate', authenticateOps, requireSuperAdmin, TenantController.migrate);
router.post('/tenants/:id/upgrade', authenticateOps, BillingController.requestUpgrade);
router.get('/tenants/:id/jobs', authenticateOps, TenantController.listJobs);
router.get('/tenants/:id/logs', authenticateOps, TenantController.getLogs);

// ============================================================
// PLANS (lecture pour tous les ops, ecriture super-admin)
// ============================================================
router.get('/plans', authenticateOps, PlanController.list);
router.get('/plans/:id', authenticateOps, PlanController.getById);
router.post('/plans', authenticateOps, requireSuperAdmin, PlanController.create);
router.patch('/plans/:id', authenticateOps, requireSuperAdmin, PlanController.update);
router.post('/plans/:id/deactivate', authenticateOps, requireSuperAdmin, PlanController.deactivate);

// ============================================================
// BILLING (checkout + webhooks publics + actions ops)
// ============================================================
router.post('/billing/checkout', authenticateOps, BillingController.startCheckout);
router.post('/billing/confirm-manual', authenticateOps, requireSuperAdmin, BillingController.confirmManualPayment);
router.post('/billing/run-autofreeze', authenticateOps, requireSuperAdmin, BillingController.runAutoFreeze);

// Webhooks publics (signature verifiee dans le controller)
// IMPORTANT : raw body pour Stripe (verif HMAC)
router.post('/billing/webhook/stripe', raw({ type: 'application/json' }), BillingController.stripeWebhook);
router.post('/billing/webhook/momo', BillingController.momoWebhook);

// ============================================================
// RELEASES + TENANT UPDATES (Phase 4.5)
// ============================================================
router.get('/releases', authenticateOps, ReleaseController.list);
router.post('/releases', authenticateOps, requireSuperAdmin, ReleaseController.create);
router.patch('/releases/:id', authenticateOps, requireSuperAdmin, ReleaseController.update);
router.post('/releases/:id/publish', authenticateOps, requireSuperAdmin, ReleaseController.publish);

router.post('/tenants/:id/updates', authenticateOps, ReleaseController.requestUpdate);
router.get('/tenants/:id/updates', authenticateOps, ReleaseController.listJobs);
router.get('/tenants/:id/updates/:jobId', authenticateOps, ReleaseController.getJob);
router.post('/tenants/:id/updates/:jobId/rollback', authenticateOps, ReleaseController.rollback);

// Endpoint de proxy pour l'API tenant (pas auth ops admin, mais service token partage).
// L'API tenant appelle ceci depuis son backend pour repondre a /api/v1/system/updates
// dans le frontend tenant.
router.get('/tenant-system/updates', requireServiceToken, ReleaseController.tenantSystemSummary);

// ============================================================
// OPS ADMINS (super-admin uniquement)
// ============================================================
router.get('/ops-admins', authenticateOps, requireSuperAdmin, OpsAdminController.list);
router.post('/ops-admins', authenticateOps, requireSuperAdmin, OpsAdminController.invite);
router.get('/ops-admins/:id', authenticateOps, requireSuperAdmin, OpsAdminController.getById);
router.patch('/ops-admins/:id', authenticateOps, requireSuperAdmin, OpsAdminController.update);
router.post('/ops-admins/:id/reset-2fa', authenticateOps, requireSuperAdmin, OpsAdminController.reset2FA);

// ============================================================
// BACKUPS (Phase 5)
// ============================================================
router.get('/tenants/:id/backups', authenticateOps, BackupController.list);
router.post('/tenants/:id/backups', authenticateOps, requireSuperAdmin, BackupController.create);
router.post('/backups/:backupId/restore', authenticateOps, requireSuperAdmin, BackupController.restore);
router.post('/backups/run-nightly', authenticateOps, requireSuperAdmin, BackupController.runNightly);

// ============================================================
// CADDY (reconciliation manuelle, super-admin)
// ============================================================
router.post('/caddy/reconcile', authenticateOps, requireSuperAdmin, CaddyController.reconcile);

// ============================================================
// AUDIT LOG (lecture seule, super-admin)
// ============================================================
router.get('/audit-logs', authenticateOps, requireSuperAdmin, AuditController.list);

export default router;
