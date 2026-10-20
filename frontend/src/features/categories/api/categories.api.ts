/** HTTP calls for the categories endpoints. Components use the hooks in queries.ts rather than calling these directly. */
import { apiClient } from '@/lib/api-client'
import type { Category } from '@/types/models'

/** Body for creating or updating a category. */
export interface CategoryInput {
  name: string
  parent_id: number | null
}

/** Category endpoints. */
export const categoriesApi = {
  /** All categories with product counts. */
  list: () => apiClient.get<Category[]>('/categories'),
  /** Admin: creates a category or subcategory. */
  create: (input: CategoryInput) => apiClient.post<Category>('/categories', input),
  /** Admin: renames or moves a category. */
  update: (id: number, input: Partial<CategoryInput>) => apiClient.patch<Category>(`/categories/${id}`, input),
  /** Admin: deletes an empty category. */
  remove: (id: number) => apiClient.delete(`/categories/${id}`),
}
