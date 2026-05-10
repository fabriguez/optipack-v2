import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import agencyRoutes from './agency.routes';
import warehouseRoutes from './warehouse.routes';
import clientRoutes from './client.routes';
import recipientRoutes from './recipient.routes';
import transitRouteRoutes from './transit-route.routes';
import parcelRoutes from './parcel.routes';
import containerRoutes from './container.routes';
import invoiceRoutes from './invoice.routes';
import paymentRoutes from './payment.routes';
import cashRegisterRoutes from './cash-register.routes';
import accountingRoutes from './accounting.routes';
import disbursementRoutes from './disbursement.routes';
import fundTransferRoutes from './fund-transfer.routes';
import expenseRoutes from './expense.routes';
import debtRoutes from './debt.routes';
import loyaltyRoutes from './loyalty.routes';
import penaltyRoutes from './penalty.routes';
import employeeRoutes from './employee.routes';
import dashboardRoutes from './dashboard.routes';
import auditRoutes from './audit.routes';
import searchRoutes from './search.routes';
import chatRoutes from './chat.routes';
import notificationRoutes from './notification.routes';
import reportRoutes from './report.routes';
import configRoutes from './config.routes';
import manifestRoutes from './manifest.routes';
import routingRoutes from './routing.routes';
import clientPortalRoutes from './client-portal.routes';
import tenantMetaRoutes from './tenant-meta.routes';
import systemRoutes from './system.routes';
import uploadRoutes from './upload.routes';
import exportRoutes from './export.routes';
import meRoutes from './me.routes';
import parcelGroupRoutes from './parcel-group.routes';
import positionRoutes from './position.routes';
import permissionRoutes from './permission.routes';
import holidayRoutes from './holiday.routes';
import workScheduleRoutes from './work-schedule.routes';
import publicTrackingRoutes from './public-tracking.routes';

const router = Router();

// Public
router.use(healthRoutes);
router.use('/tenant-meta', tenantMetaRoutes);
router.use('/organization', tenantMetaRoutes);  // alias pour PATCH /organization/branding
router.use('/system', systemRoutes);  // Phase 4.5 : updates pilote par tenant
router.use('/auth', authRoutes);
router.use('/client-portal', clientPortalRoutes);
// Suivi public (QR code scanne par le destinataire) — sans auth
router.use('/public', publicTrackingRoutes);

// Logistique
router.use('/agencies', agencyRoutes);
router.use('/warehouses', warehouseRoutes);
router.use('/clients', clientRoutes);
router.use('/recipients', recipientRoutes);
router.use('/transit-routes', transitRouteRoutes);
router.use('/parcels', parcelRoutes);
router.use('/parcel-groups', parcelGroupRoutes);
router.use('/containers', containerRoutes);
router.use('/manifests', manifestRoutes);
router.use('/routings', routingRoutes);

// Finance
router.use('/invoices', invoiceRoutes);
router.use('/payments', paymentRoutes);
router.use('/cash-registers', cashRegisterRoutes);
router.use('/accounting', accountingRoutes);
router.use('/disbursements', disbursementRoutes);
router.use('/fund-transfers', fundTransferRoutes);
router.use('/expenses', expenseRoutes);
router.use('/debts', debtRoutes);

// Systeme
router.use('/loyalty', loyaltyRoutes);
router.use('/penalties', penaltyRoutes);
router.use('/employees', employeeRoutes);
router.use('/positions', positionRoutes);
router.use('/permissions', permissionRoutes);
router.use('/holidays', holidayRoutes);
router.use('/work-schedules', workScheduleRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/audit', auditRoutes);
router.use('/search', searchRoutes);
router.use('/chat', chatRoutes);
router.use('/notifications', notificationRoutes);

// Rapports & Config
router.use('/reports', reportRoutes);
router.use(configRoutes);

// Uploads generiques (recus, justificatifs, photos colis, ...)
router.use('/uploads', uploadRoutes);

// Exports / imports XLSX (avec images embarquees)
router.use('/exports', exportRoutes);
router.use('/imports', exportRoutes);

// Self-service employe (PERSONNEL / CHEF_AGENCE)
router.use('/me', meRoutes);

export default router;
