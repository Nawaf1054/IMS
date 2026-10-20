/** HTTP calls for the products endpoints. Components use the hooks in queries.ts rather than calling these directly. */
import { apiClient, type Query } from '@/lib/api-client'
import type { Page } from '@/types/api'
import type { Product, ProductDetail, StockMovement } from '@/types/models'

import type { DeleteProductResult, ProductInput, ProductListParams, ProductMovementParams } from '../types'

/** Product endpoints. */
export const productsApi = {
  /** One page of products matching the filters. The signal cancels stale searches. */
  list: (params: ProductListParams, signal?: AbortSignal) => apiClient.get<Page<Product>>('/products', params as Query, signal),
  /** One product with its recent sales. */
  get: (id: number) => apiClient.get<ProductDetail>(`/products/${id}`),
  /** Admin: creates a product (it starts with zero stock). */
  create: (input: ProductInput) => apiClient.post<Product>('/products', input),
  /** Admin: edits a product. */
  update: (id: number, input: Partial<ProductInput>) => apiClient.patch<ProductDetail>(`/products/${id}`, input),
  /** Admin: deletes a product, or deactivates it if it was invoiced. */
  remove: (id: number) => apiClient.delete<DeleteProductResult>(`/products/${id}`),
  /** One page of a product's stock movements. */
  movements: (id: number, params: ProductMovementParams) => apiClient.get<Page<StockMovement>>(`/products/${id}/movements`, params as Query),
  /** EXP-1 / EXP-5: same filters as the list. */
  export: (params: ProductListParams) => apiClient.download('/exports/products', params as Query, 'products.xlsx'),
}
