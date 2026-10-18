import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { MovementInput, MovementListParams } from '../types'
import { stockApi } from './stock.api'

export const stockKeys = {
  all: ['stock-movements'] as const,
  list: (params: MovementListParams) => ['stock-movements', params] as const,
}

export function useMovements(params: MovementListParams) {
  return useQuery({ queryKey: stockKeys.list(params), queryFn: () => stockApi.list(params), placeholderData: keepPreviousData })
}

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
