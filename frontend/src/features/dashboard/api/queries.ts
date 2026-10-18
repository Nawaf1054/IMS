import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { DateRange } from '@/lib/dates'

import type { Granularity } from '../types'
import { dashboardApi } from './dashboard.api'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  kpis: ['dashboard', 'kpis'] as const,
  sales: (range: DateRange, granularity: Granularity) => ['dashboard', 'sales', range, granularity] as const,
  top: (range: DateRange, orderBy: string) => ['dashboard', 'top', range, orderBy] as const,
  categories: (range: DateRange) => ['dashboard', 'categories', range] as const,
}

export function useKpis() {
  return useQuery({ queryKey: dashboardKeys.kpis, queryFn: dashboardApi.kpis })
}

export function useSalesOverTime(range: DateRange, granularity: Granularity) {
  return useQuery({
    queryKey: dashboardKeys.sales(range, granularity),
    queryFn: () => dashboardApi.salesOverTime(range, granularity),
    placeholderData: keepPreviousData,
  })
}

export function useTopProducts(range: DateRange, orderBy: 'quantity' | 'revenue') {
  return useQuery({ queryKey: dashboardKeys.top(range, orderBy), queryFn: () => dashboardApi.topProducts(range, orderBy), placeholderData: keepPreviousData })
}

export function useCategoryRevenue(range: DateRange) {
  return useQuery({ queryKey: dashboardKeys.categories(range), queryFn: () => dashboardApi.categoryRevenue(range), placeholderData: keepPreviousData })
}
