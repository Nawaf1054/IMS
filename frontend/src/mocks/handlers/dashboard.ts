import { http } from 'msw'

import { addDays, daysInRange, parseISODate, toISODate } from '@/lib/dates'
import { fromCents } from '@/lib/money'
import type { CategoryRevenue, DashboardKpis, Granularity, SalesOverTime, SalesPoint, TopProduct } from '@/features/dashboard/types'

import { completedInvoices, db, invoiceTotals, localDate, productSales, rootCategoryId, salesTotals } from '../db'
import { API, fail, requireUser, route } from '../http'

function rangeFrom(url: URL) {
  const start = url.searchParams.get('start_date')
  const end = url.searchParams.get('end_date')
  if (!start || !end || start > end) fail(422, 'VALIDATION_ERROR', 'Provide a valid start_date and end_date.')
  return { start, end }
}

function bucket(start: string, end: string, granularity: Granularity): SalesPoint[] {
  const revenueByDay = new Map<string, { revenue: number; count: number }>()
  for (const inv of completedInvoices(start, end)) {
    const day = localDate(inv.created_at)
    const row = revenueByDay.get(day) ?? { revenue: 0, count: 0 }
    row.revenue += invoiceTotals(inv).total
    row.count += 1
    revenueByDay.set(day, row)
  }

  // Days are grouped into consecutive buckets: one per day, per 7 days from the start, or per calendar month.
  const buckets = new Map<string, { period_start: string; period_end: string; revenue: number; invoice_count: number }>()
  const days = daysInRange({ start, end })
  for (let i = 0; i < days; i++) {
    const date = addDays(parseISODate(start), i)
    const day = toISODate(date)
    const key = granularity === 'daily' ? day : granularity === 'weekly' ? `w${Math.floor(i / 7)}` : day.slice(0, 7)
    const point = buckets.get(key) ?? { period_start: day, period_end: day, revenue: 0, invoice_count: 0 }
    const sales = revenueByDay.get(day)
    point.period_end = day
    point.revenue += sales?.revenue ?? 0
    point.invoice_count += sales?.count ?? 0
    buckets.set(key, point)
  }
  return [...buckets.values()].map((p) => ({ ...p, revenue: fromCents(p.revenue) }))
}

export const dashboardHandlers = [
  http.get(
    `${API}/dashboard/kpis`,
    route(({ request }): DashboardKpis => {
      requireUser(request)
      const now = new Date()
      const today = toISODate(now)
      const yesterday = toISODate(addDays(now, -1))
      const monthStart = toISODate(new Date(now.getFullYear(), now.getMonth(), 1))
      const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      const prevSameDay = toISODate(new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), Math.min(now.getDate(), prevMonthEnd.getDate())))

      const todaySales = salesTotals(today, today)
      const month = salesTotals(monthStart, today)
      const active = db.products.filter((p) => p.is_active)
      return {
        total_products: db.products.length,
        active_products: active.length,
        inactive_products: db.products.length - active.length,
        stock_value: fromCents(db.products.reduce((sum, p) => sum + p.quantity * p.cost, 0)),
        stock_units: db.products.reduce((sum, p) => sum + p.quantity, 0),
        today_sales: fromCents(todaySales.revenue),
        today_invoices: todaySales.count,
        yesterday_sales: fromCents(salesTotals(yesterday, yesterday).revenue),
        month_sales: fromCents(month.revenue),
        month_invoices: month.count,
        previous_month_sales: fromCents(salesTotals(toISODate(prevMonthStart), prevSameDay).revenue),
        low_stock_count: active.filter((p) => p.quantity <= p.min_quantity).length,
        out_of_stock_count: active.filter((p) => p.quantity === 0).length,
      }
    }),
  ),

  http.get(
    `${API}/dashboard/sales-over-time`,
    route(({ request, url }): SalesOverTime => {
      requireUser(request)
      const { start, end } = rangeFrom(url)
      const granularity = (url.searchParams.get('granularity') ?? 'daily') as Granularity
      const length = daysInRange({ start, end })
      const prevEnd = toISODate(addDays(parseISODate(start), -1))
      const prevStart = toISODate(addDays(parseISODate(start), -length))
      const points = bucket(start, end, granularity)
      const previous = bucket(prevStart, prevEnd, granularity).slice(0, points.length)
      return {
        granularity,
        points,
        previous_points: previous,
        total: fromCents(salesTotals(start, end).revenue),
        previous_total: fromCents(salesTotals(prevStart, prevEnd).revenue),
      }
    }),
  ),

  http.get(
    `${API}/dashboard/top-products`,
    route(({ request, url }): TopProduct[] => {
      requireUser(request)
      const { start, end } = rangeFrom(url)
      const limit = Math.min(50, Number(url.searchParams.get('limit')) || 10)
      const byRevenue = url.searchParams.get('order_by') === 'revenue'
      const ascending = url.searchParams.get('order') === 'asc'
      return [...productSales(start, end)]
        .map(([productId, s]) => ({ product: db.products.find((p) => p.id === productId), ...s }))
        .filter((row) => row.product)
        .sort((a, b) => ((byRevenue ? b.revenue - a.revenue : b.quantity - a.quantity) || b.revenue - a.revenue) * (ascending ? -1 : 1))
        .slice(0, limit)
        .map((row) => ({
          product_id: row.product!.id,
          name: row.product!.name,
          sku: row.product!.sku,
          quantity: row.quantity,
          revenue: fromCents(row.revenue),
        }))
    }),
  ),

  http.get(
    `${API}/dashboard/category-revenue`,
    route(({ request, url }): CategoryRevenue[] => {
      requireUser(request)
      const { start, end } = rangeFrom(url)
      const byCategory = new Map<number, number>()
      for (const [productId, s] of productSales(start, end)) {
        const product = db.products.find((p) => p.id === productId)
        if (!product) continue
        const root = rootCategoryId(product.category_id)
        byCategory.set(root, (byCategory.get(root) ?? 0) + s.revenue)
      }
      const total = [...byCategory.values()].reduce((sum, v) => sum + v, 0)
      return [...byCategory]
        .sort((a, b) => b[1] - a[1])
        .map(([categoryId, revenue]) => ({
          category_id: categoryId,
          name: db.categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorised',
          revenue: fromCents(revenue),
          share: total ? revenue / total : 0,
        }))
    }),
  ),
]
