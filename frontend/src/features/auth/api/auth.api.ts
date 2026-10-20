/** HTTP calls for the auth (/auth/me) endpoints. Components use the hooks in queries.ts rather than calling these directly. */
import { apiClient } from '@/lib/api-client'
import type { User } from '@/types/models'

/** Sign-in itself goes through `authSession` (Supabase Auth); this API only reads the profile. */
export const authApi = {
  /** The signed-in user's profile and role. */
  me: () => apiClient.get<User>('/auth/me'),
}
