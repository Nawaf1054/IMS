/** TanStack Query hooks and cache keys for categories. Mutations refresh the cached data they affect. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Category } from '@/types/models'

import { categoriesApi, type CategoryInput } from './categories.api'

/** Cache keys for categories. */
export const categoryKeys = { all: ['categories'] as const }

/** All categories (cached for a minute; they rarely change). */
export function useCategories() {
  return useQuery({ queryKey: categoryKeys.all, queryFn: categoriesApi.list, staleTime: 60_000 })
}

/** One entry of a category <select>. */
export interface CategoryOption {
  id: number
  label: string
  isChild: boolean
}

/** Top-level categories followed by their subcategories ("Tools › Power Tools"). */
export function categoryOptions(categories: Category[] = []): CategoryOption[] {
  const tops = categories.filter((c) => c.parent_id === null).sort((a, b) => a.name.localeCompare(b.name))
  return tops.flatMap((top) => [
    { id: top.id, label: top.name, isChild: false },
    ...categories
      .filter((c) => c.parent_id === top.id)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((child) => ({ id: child.id, label: `${top.name} › ${child.name}`, isChild: true })),
  ])
}

/** Refreshes categories and products (product rows show category names). */
function useInvalidate() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: categoryKeys.all }), queryClient.invalidateQueries({ queryKey: ['products'] })])
}

/** Creates a category. */
export function useCreateCategory() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: CategoryInput) => categoriesApi.create(input), onSuccess: invalidate })
}

/** Renames a category. */
export function useRenameCategory() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => categoriesApi.update(id, { name }), onSuccess: invalidate })
}

/** Deletes a category. */
export function useDeleteCategory() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: number) => categoriesApi.remove(id), onSuccess: invalidate })
}
