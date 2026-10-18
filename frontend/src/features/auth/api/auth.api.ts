import { apiClient } from '@/lib/api-client'
import type { User } from '@/types/models'

/** Sign-in itself goes through `authSession` (Supabase Auth, or the mock API). */
export const authApi = {
  me: () => apiClient.get<User>('/auth/me'),
}
