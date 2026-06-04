import { apiClient } from './client';

export interface MyProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: string;
  isVerified?: boolean;
  twoFactorEnabled?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

export const profileApi = {
  // Source unique de verite : /auth/me (memes champs partout).
  me: (): Promise<MyProfile> =>
    apiClient.get('/auth/me').then((r) => r.data.data),

  update: (input: UpdateProfileInput): Promise<MyProfile> =>
    apiClient.put('/me/profile', input).then((r) => r.data.data),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient
      .post('/auth/change-password', { currentPassword, newPassword })
      .then((r) => r.data),
};
