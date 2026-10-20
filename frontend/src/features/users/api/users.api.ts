/** HTTP calls for the users (admin only) endpoints. Components use the hooks in queries.ts rather than calling these directly. */
import { apiClient } from '@/lib/api-client'
import type { Page } from '@/types/api'
import type { Role, User } from '@/types/models'

/** Body for creating a user. */
export interface CreateUserInput {
  name: string
  email: string
  role: Role
  password: string
}

/** Fields an admin can change on a user. */
export type UpdateUserInput = Partial<Pick<User, 'name' | 'email' | 'role' | 'is_active'>>

/** User endpoints. */
export const usersApi = {
  /** The first 100 users (enough for a small business; there's no paging in the UI). */
  list: () => apiClient.get<Page<User>>('/users', { page_size: 100 }),
  /** Creates the user's sign-in and profile. */
  create: (input: CreateUserInput) => apiClient.post<User>('/users', input),
  /** Changes a user's details, role or active flag. */
  update: (id: number, input: UpdateUserInput) => apiClient.patch<User>(`/users/${id}`, input),
}
