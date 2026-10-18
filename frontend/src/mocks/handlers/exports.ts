/**
 * Mock exports return CSV so the download flow works without a server. The real
 * backend returns formatted .xlsx workbooks built with openpyxl (EXP-4).
 */
import { http } from 'msw'

import { toISODate } from '@/lib/dates'
import { formatDateTime } from '@/lib/format'

import { db, invoiceSummaryView, movementView, productView } from '../db'
import { API, fileResponse, inDateRange, requireUser, route } from '../http'

/** Excel opens UTF-8 CSV correctly only with a byte-order mark. */
const BOM = String.fromCharCode(0xfeff)

function csv(rows: Array<Array<string | number>>): string {
  const cell = (value: string | number) => {
    const text = String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return `${BOM}${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`
}

const stamp = () => toISODate(new Date())

export const exportHandlers = [
  http.get(
    `${API}/exports/products`,
    route(({ request, url }) => {
      requireUser(request)
      const q = url.searchParams
      const search = q.get('search')?.toLowerCase()
      const categoryId = Number(q.get('category_id')) || null
      const ids = categoryId ? [categoryId, ...db.categories.filter((c) => c.parent_id === categoryId).map((c) => c.id)] : null
      const rows = db.products
        .map(productView)
        .filter((p) => !search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search))
        .filter((p) => !ids || ids.includes(p.category_id))
        .filter((p) => q.get('low_stock') !== 'true' || (p.is_active && p.is_low_stock))
        .filter((p) => q.get('include_inactive') === 'true' || p.is_active)
      const body = csv([
        ['Name', 'SKU', 'Category', 'Cost price', 'Sell price', 'Quantity', 'Minimum', 'Low stock', 'Active'],
        ...rows.map((p) => [
          p.name,
          p.sku,
          p.category_path,
          p.cost_price,
          p.sell_price,
          p.quantity,
          p.min_quantity,
          p.is_low_stock ? 'Yes' : 'No',
          p.is_active ? 'Yes' : 'No',
        ]),
      ])
      return fileResponse(body, `products_${stamp()}.csv`, 'text/csv')
    }),
  ),

  http.get(
    `${API}/exports/movements`,
    route(({ request, url }) => {
      requireUser(request)
      const q = url.searchParams
      const rows = db.movements
        .filter((m) => (!q.get('type') || m.type === q.get('type')) && inDateRange(m.created_at, q.get('start_date'), q.get('end_date')))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(movementView)
      const body = csv([
        ['Date', 'Product', 'SKU', 'Type', 'Quantity', 'Balance', 'Note', 'Invoice', 'By'],
        ...rows.map((m) => [
          formatDateTime(m.created_at),
          m.product_name,
          m.product_sku,
          m.type,
          m.quantity,
          m.balance_after,
          m.note,
          m.invoice_number ?? '',
          m.user_name,
        ]),
      ])
      return fileResponse(body, `movements_${q.get('start_date') ?? 'all'}_${q.get('end_date') ?? stamp()}.csv`, 'text/csv')
    }),
  ),

  http.get(
    `${API}/exports/invoices`,
    route(({ request, url }) => {
      requireUser(request)
      const q = url.searchParams
      const search = q.get('search')?.toLowerCase()
      const rows = db.invoices
        .filter((inv) => inDateRange(inv.created_at, q.get('start_date'), q.get('end_date')))
        .filter((inv) => !q.get('status') || inv.status === q.get('status'))
        .filter((inv) => !search || inv.invoice_number.toLowerCase().includes(search) || (inv.customer_name ?? '').toLowerCase().includes(search))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map(invoiceSummaryView)
      const body = csv([
        ['Invoice', 'Date', 'Customer', 'Items', 'Total', 'Status', 'Created by'],
        ...rows.map((inv) => [
          inv.invoice_number,
          formatDateTime(inv.created_at),
          inv.customer_name ?? 'Walk-in customer',
          inv.item_count,
          inv.total,
          inv.status,
          inv.user_name,
        ]),
      ])
      return fileResponse(body, `invoices_${q.get('start_date') ?? 'all'}_${q.get('end_date') ?? stamp()}.csv`, 'text/csv')
    }),
  ),
]
