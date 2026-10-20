/** TanStack Query hooks and cache keys for stock movements. Mutations refresh the cached data they affect. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { MovementInput, MovementListParams } from '../types'
import { stockApi } from './stock.api'

/** Cache keys for movement lists. */
export const stockKeys = {
  all: ['stock-movements'] as const,
  /** Key for one filtered page of movements. */
  list: (params: MovementListParams) => ['stock-movements', params] as const,
}

/** One page of movements; keeps the previous page visible while the next loads. */
export function useMovements(params: MovementListParams) {
  return useQuery({ queryKey: stockKeys.list(params), queryFn: () => stockApi.list(params), placeholderData: keepPreviousData })
}

/** Records a movement, then refreshes movements, products and the dashboard. */
export function useRecordMovement() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: MovementInput) => stockApi.create(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: stockKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ]),
  })
}
