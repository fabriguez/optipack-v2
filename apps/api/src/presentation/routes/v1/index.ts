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

const router = Router();

// Public
router.use(healthRoutes);
router.use('/auth', authRoutes);
router.use('/client-portal', clientPortalRoutes);

// Logistique
router.use('/agencies', agencyRoutes);
router.use('/warehouses', warehouseRoutes);
router.use('/clients', clientRoutes);
router.use('/recipients', recipientRoutes);
router.use('/transit-routes', transitRouteRoutes);
router.use('/parcels', parcelRoutes);
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
router.use('/dashboard', dashboardRoutes);
router.use('/audit', auditRoutes);
router.use('/search', searchRoutes);
router.use('/chat', chatRoutes);
router.use('/notifications', notificationRoutes);

// Rapports & Config
router.use('/reports', reportRoutes);
router.use(configRoutes);

export default router;
