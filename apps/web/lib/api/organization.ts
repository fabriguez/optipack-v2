import { apiClient } from './client';

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
