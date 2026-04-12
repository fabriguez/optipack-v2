import { apiClient } from './client';
import type { LoginInput, RegisterInput } from '@optipack/shared';

export const authApi = {
  login: (data: LoginInput) => apiClient.post('/auth/login', data).then((r) => r.data),
  register: (data: RegisterInput) => apiClient.post('/auth/register', data).then((r) => r.data),
  refresh: () => apiClient.post('/auth/refresh').then((r) => r.data),
  logout: () => apiClient.post('/auth/logout').then((r) => r.data),
  me: () => apiClient.get('/auth/me').then((r) => r.data),
};
