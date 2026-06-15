import SettingsPage from './SettingsPage';
import SettingsBrandingPage from './SettingsBrandingPage';
import SettingsLoyaltyPage from './SettingsLoyaltyPage';
import SettingsSystemPage from './SettingsSystemPage';
import SettingsDebtBlockPage from './SettingsDebtBlockPage';
import SettingsSitePage from './SettingsSitePage';
import SettingsPaymentMethodsPage from './SettingsPaymentMethodsPage';
import SettingsPaymentProvidersPage from './SettingsPaymentProvidersPage';
import SettingsNotificationsPage from './SettingsNotificationsPage';
import SettingsEmailPage from './SettingsEmailPage';

export const routes = [
  { path: 'settings', element: <SettingsPage /> },
  { path: 'settings/branding', element: <SettingsBrandingPage /> },
  { path: 'settings/loyalty', element: <SettingsLoyaltyPage /> },
  { path: 'settings/system', element: <SettingsSystemPage /> },
  { path: 'settings/debt-block', element: <SettingsDebtBlockPage /> },
  { path: 'settings/site', element: <SettingsSitePage /> },
  { path: 'settings/payment-methods', element: <SettingsPaymentMethodsPage /> },
  { path: 'settings/payment-providers', element: <SettingsPaymentProvidersPage /> },
  { path: 'settings/notifications', element: <SettingsNotificationsPage /> },
  { path: 'settings/email', element: <SettingsEmailPage /> },
];
