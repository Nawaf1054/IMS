import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { ProductInput, ProductListParams, ProductMovementParams } from '../types'
import { productsApi } from './products.api'

export const productKeys = {
  all: ['products'] as const,
  list: (params: ProductListParams) => ['products', 'list', params] as const,
  detail: (id: number) => ['products', 'detail', id] as const,
  movements: (id: number, params: ProductMovementParams) => ['products', 'movements', id, params] as const,
}

export function useProducts(params: ProductListParams, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: ({ signal }) => productsApi.list(params, signal),
    placeholderData: keepPreviousData,
    ...options,
  })
}

export function useProduct(id: number) {
  return useQuery({ queryKey: productKeys.detail(id), queryFn: () => productsApi.get(id), enabled: Number.isFinite(id) })
}

export function useProductMovements(id: number, params: ProductMovementParams) {
  return useQuery({
    queryKey: productKeys.movements(id, params),
    queryFn: () => productsApi.movements(id, params),
    placeholderData: keepPreviousData,
  })
}

/** Count shown on the sidebar badge and dashboard. */
export function useLowStockCount() {
  return useQuery({
    queryKey: productKeys.list({ low_stock: true, page_size: 1 }),
    queryFn: () => productsApi.list({ low_stock: true, page_size: 1 }),
    select: (page) => page.total,
  })
}

function useInvalidateCatalog() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: productKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['categories'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: (input: ProductInput) => productsApi.create(input), onSuccess: invalidate })
}

export function useUpdateProduct(id: number) {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: (input: Partial<ProductInput>) => productsApi.update(id, input), onSuccess: invalidate })
}

export function useDeleteProduct() {
  const invalidate = useInvalidateCatalog()
  return useMutation({ mutationFn: (id: number) => productsApi.remove(id), onSuccess: invalidate })
}
