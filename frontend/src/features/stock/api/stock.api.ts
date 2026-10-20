/** HTTP calls for the stock movements endpoints. Components use the hooks in queries.ts rather than calling these directly. */
import { apiClient, type Query } from '@/lib/api-client'
import type { Page } from '@/types/api'
import type { StockMovement } from '@/types/models'

import type { MovementInput, MovementListParams } from '../types'

/** Stock movement endpoints. */
export const stockApi = {
  /** One page of movements matching the filters. */
  list: (params: MovementListParams) => apiClient.get<Page<StockMovement>>('/stock-movements', params as Query),
  /** Records an IN, OUT or ADJUSTMENT movement. */
  create: (input: MovementInput) => apiClient.post<StockMovement>('/stock-movements', input),
  /** EXP-2: movements for a date range, honouring the type filter. */
  export: (params: MovementListParams) => apiClient.download('/exports/movements', params as Query, 'movements.xlsx'),
}
