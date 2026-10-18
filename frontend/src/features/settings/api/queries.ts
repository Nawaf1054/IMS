import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { formatMoney } from '@/lib/format'
import type { Money } from '@/types/api'
import type { BusinessSettings } from '@/types/models'

import { settingsApi } from './settings.api'

export const settingsKeys = { all: ['settings'] as const }

export function useSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: settingsApi.get, staleTime: 5 * 60_000 })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<BusinessSettings>) => settingsApi.update(input),
    onSuccess: (settings) => queryClient.setQueryData(settingsKeys.all, settings),
  })
}

export const DEFAULT_CURRENCY = 'SAR'

export function useCurrency(): string {
  return useSettings().data?.currency ?? DEFAULT_CURRENCY
}

/** Formatter bound to the business currency: `money("1380")` → "SAR 1,380.00". */
export function useMoney(): (value: Money | number) => string {
  const currency = useCurrency()
  return (value) => formatMoney(value, currency)
}
