import { apiClient } from './client';

export interface LoyaltyConfigDTO {
  enabled: boolean;
  pointsPerXaf: number;
  fcfaPerPoint: number;
  tierThresholds: { SILVER: number; GOLD: number; VIP: number };
}

export const loyaltyConfigApi = {
  get: () => apiClient.get('/system/loyalty-config').then((r) => r.data),
  update: (patch: Partial<LoyaltyConfigDTO>) =>
    apiClient.put('/system/loyalty-config', patch).then((r) => r.data),
};
