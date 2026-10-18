import { apiClient } from '@/lib/api-client'
import type { DateRange } from '@/lib/dates'

import type { CategoryRevenue, DashboardKpis, Granularity, SalesOverTime, TopProduct } from '../types'

const range = (r: DateRange) => ({ start_date: r.start, end_date: r.end })

export const dashboardApi = {
  kpis: () => apiClient.get<DashboardKpis>('/dashboard/kpis'),
  salesOverTime: (r: DateRange, granularity: Granularity) => apiClient.get<SalesOverTime>('/dashboard/sales-over-time', { ...range(r), granularity }),
  topProducts: (r: DateRange, orderBy: 'quantity' | 'revenue') =>
    apiClient.get<TopProduct[]>('/dashboard/top-products', { ...range(r), order_by: orderBy, limit: 10 }),
  categoryRevenue: (r: DateRange) => apiClient.get<CategoryRevenue[]>('/dashboard/category-revenue', range(r)),
}
