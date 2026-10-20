/** HTTP calls for the dashboard (/dashboard) endpoints. Components use the hooks in queries.ts rather than calling these directly. */
import { apiClient } from '@/lib/api-client'
import type { DateRange } from '@/lib/dates'

import type { CategoryRevenue, DashboardKpis, Granularity, SalesOverTime, TopProduct } from '../types'

/** The dashboard's date range as query parameters. */
const range = (r: DateRange) => ({ start_date: r.start, end_date: r.end })

/** Dashboard endpoints. All figures are computed by the backend in SQL. */
export const dashboardApi = {
  /** KPI card figures (not affected by the date filter). */
  kpis: () => apiClient.get<DashboardKpis>('/dashboard/kpis'),
  /** Revenue per day, week or month, plus the previous period. */
  salesOverTime: (r: DateRange, granularity: Granularity) => apiClient.get<SalesOverTime>('/dashboard/sales-over-time', { ...range(r), granularity }),
  /** Top 10 products by units sold or by revenue. */
  topProducts: (r: DateRange, orderBy: 'quantity' | 'revenue') =>
    apiClient.get<TopProduct[]>('/dashboard/top-products', { ...range(r), order_by: orderBy, limit: 10 }),
  /** Revenue per top-level category. */
  categoryRevenue: (r: DateRange) => apiClient.get<CategoryRevenue[]>('/dashboard/category-revenue', range(r)),
}
