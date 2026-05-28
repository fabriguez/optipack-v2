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
      { screen: 'agencies/index', label: 'Agences', icon: 'business-outline' },
      { screen: 'warehouses/index', label: 'Magasins', icon: 'home-outline' },
      { screen: 'clients/index', label: 'Clients', icon: 'people-outline' },
      { screen: 'parcels/index', label: 'Colis', icon: 'cube-outline' },
      { screen: 'parcel-groups/index', label: 'Groupes de colis', icon: 'albums-outline' },
      { screen: 'containers/index', label: 'Conteneurs', icon: 'archive-outline' },
      { screen: 'carriers/index', label: 'Transporteurs', icon: 'bus-outline' },
      { screen: 'transit-routes/index', label: 'Routes transit', icon: 'navigate-outline' },
    ],
  },
  {
    title: 'Finance',
    defaultOpen: true,
    items: [
      { screen: 'invoices/index', label: 'Factures', icon: 'document-text-outline' },
      { screen: 'payments/index', label: 'Paiements', icon: 'card-outline' },
      { screen: 'cash-register/index', label: 'Caisse', icon: 'wallet-outline' },
      { screen: 'disbursements/index', label: 'Decaissements', icon: 'cash-outline' },
      { screen: 'fund-transfers/index', label: 'Transferts', icon: 'swap-horizontal-outline' },
      { screen: 'accounting/index', label: 'Comptabilite', icon: 'book-outline' },
      { screen: 'expenses/index', label: 'Depenses', icon: 'pricetag-outline' },
      { screen: 'debts/index', label: 'Dettes', icon: 'warning-outline' },
      { screen: 'finance-history/index', label: 'Historique financier', icon: 'time-outline' },
    ],
  },
  {
    title: 'Systeme',
    defaultOpen: false,
    items: [
      { screen: 'employees/index', label: 'Personnel', icon: 'person-outline' },
      { screen: 'loyalty/index', label: 'Fidelite', icon: 'star-outline' },
      { screen: 'penalties/index', label: 'Penalites', icon: 'alert-circle-outline' },
      { screen: 'notifications/index', label: 'Notifications', icon: 'notifications-outline' },
      { screen: 'chat/index', label: 'Support', icon: 'chatbubbles-outline' },
      { screen: 'reports/index', label: 'Rapports', icon: 'bar-chart-outline' },
      { screen: 'settings/index', label: 'Parametres', icon: 'settings-outline' },
      { screen: 'audit-log/index', label: 'Audit', icon: 'shield-outline' },
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
