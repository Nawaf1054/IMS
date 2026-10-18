import { apiClient } from '@/lib/api-client'
import type { LoginResponse, User } from '@/types/models'

export const authApi = {
  login: (email: string, password: string) => apiClient.post<LoginResponse>('/auth/login', { email, password }),
  me: () => apiClient.get<User>('/auth/me'),
}
