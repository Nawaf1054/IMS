import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { Category } from '@/types/models'

import { categoriesApi, type CategoryInput } from './categories.api'

export const categoryKeys = { all: ['categories'] as const }

export function useCategories() {
  return useQuery({ queryKey: categoryKeys.all, queryFn: categoriesApi.list, staleTime: 60_000 })
}

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

function useInvalidate() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: categoryKeys.all }), queryClient.invalidateQueries({ queryKey: ['products'] })])
}

export function useCreateCategory() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (input: CategoryInput) => categoriesApi.create(input), onSuccess: invalidate })
}

export function useRenameCategory() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => categoriesApi.update(id, { name }), onSuccess: invalidate })
}

export function useDeleteCategory() {
  const invalidate = useInvalidate()
  return useMutation({ mutationFn: (id: number) => categoriesApi.remove(id), onSuccess: invalidate })
}
