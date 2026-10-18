import { apiClient } from '@/lib/api-client'
import type { Category } from '@/types/models'

export interface CategoryInput {
  name: string
  parent_id: number | null
}

export const categoriesApi = {
  list: () => apiClient.get<Category[]>('/categories'),
  create: (input: CategoryInput) => apiClient.post<Category>('/categories', input),
  update: (id: number, input: Partial<CategoryInput>) => apiClient.patch<Category>(`/categories/${id}`, input),
  remove: (id: number) => apiClient.delete(`/categories/${id}`),
}
