import { Router, raw } from 'express';
import { AuthController } from '../controllers/AuthController';
import { VpsController } from '../controllers/VpsController';
import { TenantController } from '../controllers/TenantController';
import { TenantMailController } from '../controllers/TenantMailController';
import { OpsAdminController } from '../controllers/OpsAdminController';
import { AuditController } from '../controllers/AuditController';
import { PlanController } from '../controllers/PlanController';
import { BillingController } from '../controllers/BillingController';
import { ReleaseController } from '../controllers/ReleaseController';
import { SiteController } from '../controllers/SiteController';
import { BackupController } from '../controllers/BackupController';
import { CaddyController } from '../controllers/CaddyController';
import { UfwController } from '../controllers/UfwController';
import { authenticateOps, requireSuperAdmin, requireGlobalOps, enforceTenantParam } from '../middleware/authOpsMiddleware';
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
router.post('/auth/2fa/self-setup', authenticateOps, AuthController.selfSetupTwoFactor);
router.post('/auth/2fa/self-confirm', authenticateOps, AuthController.selfConfirmTwoFactor);
router.post('/auth/2fa/recovery/regenerate', authenticateOps, AuthController.regenerateRecoveryCodes);
router.post('/auth/change-password', authenticateOps, AuthController.changePassword);
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
router.post('/vps/refresh-usage', authenticateOps, requireSuperAdmin, VpsController.refreshAllUsage);
router.post('/vps/:id/bootstrap', authenticateOps, requireSuperAdmin, VpsController.bootstrap);
router.get('/vps/:id/capacity', authenticateOps, requireSuperAdmin, BillingController.vpsCapacity);

// ============================================================
// TENANTS (auth ; archive + migrate reserves super-admin)
// ============================================================
router.get('/tenants', authenticateOps, requireGlobalOps, TenantController.list);
router.post('/tenants', authenticateOps, requireGlobalOps, TenantController.create);
// Vue tenant : un compte facturation ne voit QUE son propre tenant.
router.get('/tenants/:id', authenticateOps, enforceTenantParam(), TenantController.getById);
// Billing scope tenant : abonnement + paiements + plan (vue + paiement MoMo).
router.get('/tenants/:id/billing', authenticateOps, enforceTenantParam(), BillingController.tenantBilling);
router.patch('/tenants/:id', authenticateOps, requireGlobalOps, TenantController.update);
// Upload du logo (fichier image BRUT, binaire) -> relaye a l'API tenant (bucket
// public). Studio. raw() parse le body binaire (image/*, max 5 Mo) en Buffer.
router.post(
  '/tenants/:id/logo',
  authenticateOps,
  requireGlobalOps,
  raw({ type: 'image/*', limit: '5mb' }),
  TenantController.uploadLogo,
);
router.post('/tenants/:id/freeze', authenticateOps, requireGlobalOps, TenantController.freeze);
router.post('/tenants/:id/unfreeze', authenticateOps, requireGlobalOps, TenantController.unfreeze);
router.post('/tenants/:id/archive', authenticateOps, requireSuperAdmin, TenantController.archive);
router.delete('/tenants/:id/purge', authenticateOps, requireSuperAdmin, TenantController.purge);
router.post('/tenants/:id/reset-owner-password', authenticateOps, requireSuperAdmin, TenantController.resetOwnerPassword);
// Gestion du compte facturation tenant (super-admin) : (re)generer / consulter.
router.get('/tenants/:id/billing-user', authenticateOps, requireSuperAdmin, TenantController.getBillingUser);
router.post('/tenants/:id/billing-user', authenticateOps, requireSuperAdmin, TenantController.resetBillingUser);
router.get('/tenants/:id/containers', authenticateOps, requireGlobalOps, TenantController.containers);
router.get('/tenants/:id/containers/:name/logs', authenticateOps, requireGlobalOps, TenantController.containerLogs);
router.post('/tenants/:id/containers/:name/exec', authenticateOps, requireSuperAdmin, TenantController.containerExec);
router.post('/tenants/:id/stack/stop', authenticateOps, requireSuperAdmin, TenantController.stackStop);
router.post('/tenants/:id/stack/start', authenticateOps, requireSuperAdmin, TenantController.stackStart);
router.post('/tenants/:id/stack/restart', authenticateOps, requireSuperAdmin, TenantController.stackRestart);
router.post('/tenants/:id/migrate', authenticateOps, requireSuperAdmin, TenantController.migrate);
// Upgrade/changement de plan : autorise au compte facturation pour SON tenant.
router.post('/tenants/:id/upgrade', authenticateOps, enforceTenantParam(), BillingController.requestUpgrade);
router.get('/tenants/:id/jobs', authenticateOps, requireGlobalOps, TenantController.listJobs);
router.get('/tenants/:id/jobs/:jobId', authenticateOps, requireGlobalOps, TenantController.getJob);
router.get('/tenants/:id/logs', authenticateOps, requireGlobalOps, TenantController.getLogs);

// Messagerie (envoi via Resend, 1 domaine par tenant).
router.get('/tenants/:id/mail', authenticateOps, requireGlobalOps, TenantMailController.get);
router.post('/tenants/:id/mail/provision', authenticateOps, requireGlobalOps, TenantMailController.provision);
router.post('/tenants/:id/mail/verify', authenticateOps, requireGlobalOps, TenantMailController.verify);
router.post('/tenants/:id/mail/refresh', authenticateOps, requireGlobalOps, TenantMailController.refresh);

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
router.get('/billing/overview', authenticateOps, requireGlobalOps, BillingController.overview);
// Checkout : accessible au compte facturation tenant. Le controller force le
// scope (un compte tenant ne peut payer QUE pour son propre tenant).
router.post('/billing/checkout', authenticateOps, BillingController.startCheckout);
router.post('/billing/confirm-manual', authenticateOps, requireSuperAdmin, BillingController.confirmManualPayment);
// Paiement hors ligne (especes / virement) encaisse par l'ops admin pour un tenant.
router.post('/tenants/:id/billing/offline-payment', authenticateOps, requireSuperAdmin, BillingController.recordOfflinePayment);
router.post('/billing/run-autofreeze', authenticateOps, requireSuperAdmin, BillingController.runAutoFreeze);

// Webhooks publics (signature verifiee dans le controller)
// IMPORTANT : raw body pour Stripe (verif HMAC)
router.post('/billing/webhook/stripe', raw({ type: 'application/json' }), BillingController.stripeWebhook);
router.post('/billing/webhook/momo', BillingController.momoWebhook);
// Webhook GitHub push -> auto-deploy du site custom. Public : legitimite via
// HMAC X-Hub-Signature-256 (webhookSecret du site). raw body requis. On capture
// le body brut QUEL QUE SOIT le content-type : GitHub envoie par defaut en
// application/x-www-form-urlencoded (payload=<json>), pas seulement en
// application/json -> sinon body vide et signature toujours invalide (401).
router.post(
  '/webhooks/github/site/:tenantId',
  raw({ type: () => true, limit: '5mb' }),
  SiteController.webhook,
);

// ============================================================
// RELEASES + TENANT UPDATES (Phase 4.5)
// ============================================================
router.get('/releases', authenticateOps, requireGlobalOps, ReleaseController.list);
router.post('/releases/sync', authenticateOps, requireSuperAdmin, ReleaseController.sync);
router.get('/ghcr/tags', authenticateOps, requireGlobalOps, ReleaseController.listGhcrTags);
router.post('/releases', authenticateOps, requireSuperAdmin, ReleaseController.create);
router.get('/releases/:id', authenticateOps, requireGlobalOps, ReleaseController.getById);
router.patch('/releases/:id', authenticateOps, requireSuperAdmin, ReleaseController.update);
router.post('/releases/:id/publish', authenticateOps, requireSuperAdmin, ReleaseController.publish);

router.post('/tenants/:id/updates', authenticateOps, requireGlobalOps, ReleaseController.requestUpdate);
router.get('/tenants/:id/updates', authenticateOps, requireGlobalOps, ReleaseController.listJobs);
router.get('/tenants/:id/updates/:jobId', authenticateOps, requireGlobalOps, ReleaseController.getJob);
router.post('/tenants/:id/updates/:jobId/rollback', authenticateOps, requireSuperAdmin, ReleaseController.rollback);

// ============================================================
// SITE CUSTOM (repo GitHub buildé + lancé sur le VPS, isolé des updates)
// ============================================================
router.get('/tenants/:id/site', authenticateOps, requireGlobalOps, SiteController.get);
router.put('/tenants/:id/site', authenticateOps, requireGlobalOps, SiteController.configure);
router.post('/tenants/:id/site/redeploy', authenticateOps, requireGlobalOps, SiteController.redeploy);
router.post('/tenants/:id/site/webhook/regenerate', authenticateOps, requireGlobalOps, SiteController.regenerateWebhook);
router.delete('/tenants/:id/site', authenticateOps, requireSuperAdmin, SiteController.remove);

// Endpoint de proxy pour l'API tenant (pas auth ops admin, mais service token partage).
// L'API tenant appelle ceci depuis son backend pour repondre a /api/v1/system/updates
// dans le frontend tenant.
router.get('/tenant-system/updates', requireServiceToken, ReleaseController.tenantSystemSummary);

// Tenant-self studio (proxy depuis l'API tenant via service token).
// Le tenant owner peut editer le theme et la config visible de son propre
// tenant sans avoir de compte ops-admin.
// Catalogue de skins (ops-admin + tenant-self).
router.get('/skins/catalog', async (_req, res) => {
  const { listSkins } = await import('@transitsoftservices/skins');
  res.json({ success: true, data: listSkins() });
});

router.get('/tenant-self/studio', requireServiceToken, TenantController.getSelfStudio);
router.patch('/tenant-self/studio', requireServiceToken, TenantController.patchSelfStudio);

// Messagerie (envoi Resend, et bientot reception Mailcow) accessible au tenant
// via proxy service-token depuis son API.
router.get('/tenant-self/mail', requireServiceToken, TenantMailController.get);
router.post('/tenant-self/mail/provision', requireServiceToken, TenantMailController.provision);
router.post('/tenant-self/mail/verify', requireServiceToken, TenantMailController.verify);
router.post('/tenant-self/mail/refresh', requireServiceToken, TenantMailController.refresh);

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
router.get('/tenants/:id/backups', authenticateOps, requireGlobalOps, BackupController.list);
router.post('/tenants/:id/backups', authenticateOps, requireSuperAdmin, BackupController.create);
router.post('/backups/:backupId/restore', authenticateOps, requireSuperAdmin, BackupController.restore);
router.post('/backups/run-nightly', authenticateOps, requireSuperAdmin, BackupController.runNightly);

// ============================================================
// CADDY (reconciliation manuelle, super-admin)
// ============================================================
router.post('/caddy/reconcile', authenticateOps, requireSuperAdmin, CaddyController.reconcile);

// ============================================================
// UFW (firewall par VPS, super-admin)
// ============================================================
router.get('/vps/:id/ufw', authenticateOps, requireSuperAdmin, UfwController.status);
router.post('/vps/:id/ufw/enable', authenticateOps, requireSuperAdmin, UfwController.enable);
router.post('/vps/:id/ufw/disable', authenticateOps, requireSuperAdmin, UfwController.disable);
router.post('/vps/:id/ufw/rules', authenticateOps, requireSuperAdmin, UfwController.addRule);
router.delete('/vps/:id/ufw/rules/:index', authenticateOps, requireSuperAdmin, UfwController.deleteRule);
router.post('/vps/:id/ufw/baseline', authenticateOps, requireSuperAdmin, UfwController.applyBaseline);

// ============================================================
// AUDIT LOG (lecture seule, super-admin)
// ============================================================
router.get('/audit-logs', authenticateOps, requireSuperAdmin, AuditController.list);

export default router;
