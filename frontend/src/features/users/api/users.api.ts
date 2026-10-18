import { apiClient } from '@/lib/api-client'
import type { Page } from '@/types/api'
import type { Role, User } from '@/types/models'

export interface CreateUserInput {
  name: string
  email: string
  role: Role
  password: string
}

export type UpdateUserInput = Partial<Pick<User, 'name' | 'email' | 'role' | 'is_active'>>

export const usersApi = {
  list: () => apiClient.get<Page<User>>('/users', { page_size: 100 }),
  create: (input: CreateUserInput) => apiClient.post<User>('/users', input),
  update: (id: number, input: UpdateUserInput) => apiClient.patch<User>(`/users/${id}`, input),
}
