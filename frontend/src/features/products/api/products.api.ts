import { apiClient, type Query } from '@/lib/api-client'
import type { Page } from '@/types/api'
import type { Product, ProductDetail, StockMovement } from '@/types/models'

import type { DeleteProductResult, ProductInput, ProductListParams, ProductMovementParams } from '../types'

export const productsApi = {
  list: (params: ProductListParams, signal?: AbortSignal) => apiClient.get<Page<Product>>('/products', params as Query, signal),
  get: (id: number) => apiClient.get<ProductDetail>(`/products/${id}`),
  create: (input: ProductInput) => apiClient.post<Product>('/products', input),
  update: (id: number, input: Partial<ProductInput>) => apiClient.patch<ProductDetail>(`/products/${id}`, input),
  remove: (id: number) => apiClient.delete<DeleteProductResult>(`/products/${id}`),
  movements: (id: number, params: ProductMovementParams) => apiClient.get<Page<StockMovement>>(`/products/${id}/movements`, params as Query),
  /** EXP-1 / EXP-5: same filters as the list. */
  export: (params: ProductListParams) => apiClient.download('/exports/products', params as Query, 'products.xlsx'),
}
