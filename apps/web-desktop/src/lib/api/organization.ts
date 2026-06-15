import { apiClient } from './client';

export interface ProviderCredentials {
  [key: string]: string | undefined;
}

export interface PaymentProviderEntry {
  name: string;
  priority: number;
  countries?: string[];
  apiBaseUrl?: string;
  credentials?: ProviderCredentials;
}

export interface PaymentChannelEntry {
  channel: 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER' | 'USSD';
  providers: PaymentProviderEntry[];
}

export interface PaymentProvidersConfig {
  channels: PaymentChannelEntry[];
}

export const paymentConfigApi = {
  get: (): Promise<{ success: boolean; data: PaymentProvidersConfig }> =>
    apiClient.get('/tenant-meta/payment-config').then((r) => r.data),

  save: (config: PaymentProvidersConfig): Promise<{ success: boolean; data: PaymentProvidersConfig }> =>
    apiClient.patch('/tenant-meta/payment-config', config).then((r) => r.data),
};

export interface OrganizationBranding {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  supportEmail: string | null;
}

export const organizationApi = {
  updateBranding: (
    data: Partial<{
      name: string;
      logoUrl: string | null;
      primaryColor: string;
      secondaryColor: string;
      accentColor: string;
      supportEmail: string | null;
    }>,
  ): Promise<{ success: boolean; data: OrganizationBranding }> =>
    apiClient.patch('/organization/branding', data).then((r) => r.data),
};
