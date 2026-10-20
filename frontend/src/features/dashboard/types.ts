/** Response types for the dashboard endpoints (/dashboard). Figures come from the backend's SQL. */
import type { Money } from '@/types/api'

/** GET /dashboard/kpis: current figures, independent of the date filter (DSH-1). */
export interface DashboardKpis {
  total_products: number
  active_products: number
  inactive_products: number
  stock_value: Money
  stock_units: number
  today_sales: Money
  today_invoices: number
  yesterday_sales: Money
  month_sales: Money
  month_invoices: number
  /** Same days of the previous month, for the comparison line. */
  previous_month_sales: Money
  low_stock_count: number
  out_of_stock_count: number
}

/** Bucket size of the revenue chart. */
export type Granularity = 'daily' | 'weekly' | 'monthly'

/** One chart bucket: its first and last day, revenue and invoice count. */
export interface SalesPoint {
  period_start: string
  period_end: string
  revenue: Money
  invoice_count: number
}

/** GET /dashboard/sales-over-time (DSH-2) with the preceding period of equal length. */
export interface SalesOverTime {
  granularity: Granularity
  points: SalesPoint[]
  previous_points: SalesPoint[]
  total: Money
  previous_total: Money
}

/** GET /dashboard/top-products (DSH-3) */
export interface TopProduct {
  product_id: number
  name: string
  sku: string
  quantity: number
  revenue: Money
}

/** GET /dashboard/category-revenue (DSH-4); subcategories roll up into their parent. */
export interface CategoryRevenue {
  category_id: number
  name: string
  revenue: Money
  share: number
}
