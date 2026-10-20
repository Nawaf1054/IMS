/**
 * TanStack Query hooks and cache keys for business settings. Mutations refresh the cached data they affect.
 * Also provides the business currency and a money formatter bound to it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { formatMoney } from '@/lib/format'
import type { Money } from '@/types/api'
import type { BusinessSettings } from '@/types/models'

import { settingsApi } from './settings.api'

/** Cache key for the settings. */
export const settingsKeys = { all: ['settings'] as const }

/** The business settings (cached for five minutes). */
export function useSettings() {
  return useQuery({ queryKey: settingsKeys.all, queryFn: settingsApi.get, staleTime: 5 * 60_000 })
}

/** Saves settings and puts the result straight into the cache. */
export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<BusinessSettings>) => settingsApi.update(input),
    onSuccess: (settings) => queryClient.setQueryData(settingsKeys.all, settings),
  })
}

/** Currency used until the settings have loaded. */
export const DEFAULT_CURRENCY = 'SAR'

/** The business currency code, e.g. "SAR". */
export function useCurrency(): string {
  return useSettings().data?.currency ?? DEFAULT_CURRENCY
}

/** Formatter bound to the business currency: `money("1380")` → "SAR 1,380.00". */
export function useMoney(): (value: Money | number) => string {
  const currency = useCurrency()
  return (value) => formatMoney(value, currency)
}
