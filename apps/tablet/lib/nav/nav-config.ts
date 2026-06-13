import type { ComponentProps } from 'react';
import type { Ionicons } from '@expo/vector-icons';

type IoniconsName = ComponentProps<typeof Ionicons>['name'];

export interface NavItem {
  /** Path under (dashboard)/ — e.g. "parcels/index" */
  screen: string;
  label: string;
  icon: IoniconsName;
  /** ABAC permission(s) required ('any' mode). Empty/undefined = visible to all authed users. */
  permissions?: string[];
  /** Restrict to ADMIN/SUPER_ADMIN. */
  adminOnly?: boolean;
}

export interface NavSection {
  title: string;
  defaultOpen?: boolean;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: 'Menu',
    defaultOpen: true,
    items: [
      { screen: 'index', label: 'Tableau de bord', icon: 'grid-outline' },
      { screen: 'agencies/index', label: 'Agences', icon: 'business-outline', permissions: ['agency.read'] },
      { screen: 'warehouses/index', label: 'Magasins', icon: 'home-outline', permissions: ['warehouse.read'] },
      { screen: 'clients/index', label: 'Clients', icon: 'people-outline', permissions: ['client.read'] },
      { screen: 'parcels/index', label: 'Colis', icon: 'cube-outline', permissions: ['parcel.read'] },
      { screen: 'containers/index', label: 'Conteneurs', icon: 'archive-outline', permissions: ['container.read'] },
      { screen: 'carriers/index', label: 'Transporteurs', icon: 'bus-outline', permissions: ['carrier.read'] },
      { screen: 'transit-routes/index', label: 'Routes transit', icon: 'navigate-outline', permissions: ['transitroute.read'] },
    ],
  },
  {
    title: 'Finance',
    defaultOpen: true,
    items: [
      { screen: 'invoices/index', label: 'Factures', icon: 'document-text-outline', permissions: ['invoice.read'] },
      { screen: 'payments/index', label: 'Paiements', icon: 'card-outline', permissions: ['payment.read'] },
      { screen: 'cash-register/index', label: 'Caisse', icon: 'wallet-outline', permissions: ['cashregister.read'] },
      { screen: 'disbursements/index', label: 'Decaissements', icon: 'cash-outline', permissions: ['disbursement.read'] },
      { screen: 'fund-transfers/index', label: 'Transferts', icon: 'swap-horizontal-outline', permissions: ['transfer.read'] },
      { screen: 'accounting/index', label: 'Comptabilite', icon: 'book-outline', permissions: ['accounting.read'] },
      { screen: 'expenses/index', label: 'Depenses', icon: 'pricetag-outline', permissions: ['expense.read'] },
      { screen: 'debts/index', label: 'Dettes', icon: 'warning-outline', permissions: ['debt.read'] },
      { screen: 'finance-history/index', label: 'Historique financier', icon: 'time-outline', permissions: ['finance.history.read', 'finance.dashboard.read'] },
    ],
  },
  {
    title: 'Systeme',
    defaultOpen: false,
    items: [
      { screen: 'employees/index', label: 'Personnel', icon: 'person-outline', permissions: ['personnel.read'] },
      { screen: 'loyalty/index', label: 'Fidelite', icon: 'star-outline', permissions: ['loyalty.read'] },
      { screen: 'penalties/index', label: 'Penalites', icon: 'alert-circle-outline', permissions: ['penalty.read'] },
      { screen: 'notifications/index', label: 'Notifications', icon: 'notifications-outline' },
      { screen: 'chat/index', label: 'Support', icon: 'chatbubbles-outline', permissions: ['support.read'] },
      { screen: 'reports/index', label: 'Rapports', icon: 'bar-chart-outline', permissions: ['report.read'] },
      { screen: 'settings/index', label: 'Parametres', icon: 'settings-outline' },
      { screen: 'audit-log/index', label: 'Audit', icon: 'shield-outline', permissions: ['audit.read'] },
    ],
  },
  {
    title: 'Administration',
    defaultOpen: false,
    items: [
      {
        screen: 'admin/index',
        label: 'Administration RH',
        icon: 'shield-checkmark-outline',
        permissions: ['position.manage', 'permission.manage', 'schedule.manage', 'holiday.manage'],
      },
    ],
  },
];

export const allNavScreens = navSections.flatMap((s) => s.items);
