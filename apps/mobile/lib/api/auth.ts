import { apiClient } from './client';

/**
 * Endpoints publics de reinitialisation de mot de passe (staff / espace client
 * sur compte User). Le login/refresh est gere par AuthContext.
 */
export const authApi = {
  forgotPassword: (email: string) =>
    apiClient.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (payload: { email: string; code: string; newPassword: string }) =>
    apiClient.post('/auth/reset-password', payload).then((r) => r.data),
};
