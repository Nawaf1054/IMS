/**
 * TanStack Query hooks and cache keys for the dashboard (read-only). Range-based widgets keep showing
 * the previous data while a new range loads.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import type { DateRange } from '@/lib/dates'

import type { Granularity } from '../types'
import { dashboardApi } from './dashboard.api'

/** Cache keys for dashboard data; invalidating `all` refreshes every widget. */
export const dashboardKeys = {
  all: ['dashboard'] as const,
  kpis: ['dashboard', 'kpis'] as const,
  /** Key for the revenue chart at a range and granularity. */
  sales: (range: DateRange, granularity: Granularity) => ['dashboard', 'sales', range, granularity] as const,
  /** Key for top products at a range and sort order. */
  top: (range: DateRange, orderBy: string) => ['dashboard', 'top', range, orderBy] as const,
  /** Key for category revenue at a range. */
  categories: (range: DateRange) => ['dashboard', 'categories', range] as const,
}

/** The KPI card figures. */
export function useKpis() {
  return useQuery({ queryKey: dashboardKeys.kpis, queryFn: dashboardApi.kpis })
}

/** The revenue chart's points for a range and granularity. */
export function useSalesOverTime(range: DateRange, granularity: Granularity) {
  return useQuery({
    queryKey: dashboardKeys.sales(range, granularity),
    queryFn: () => dashboardApi.salesOverTime(range, granularity),
    placeholderData: keepPreviousData,
  })
}

/** Top products for a range. */
export function useTopProducts(range: DateRange, orderBy: 'quantity' | 'revenue') {
  return useQuery({ queryKey: dashboardKeys.top(range, orderBy), queryFn: () => dashboardApi.topProducts(range, orderBy), placeholderData: keepPreviousData })
}

/** Revenue by category for a range. */
export function useCategoryRevenue(range: DateRange) {
  return useQuery({ queryKey: dashboardKeys.categories(range), queryFn: () => dashboardApi.categoryRevenue(range), placeholderData: keepPreviousData })
}
