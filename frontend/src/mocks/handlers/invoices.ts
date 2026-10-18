import { http } from 'msw'

import { formatDocumentDateTime, formatMoney, formatTaxRate } from '@/lib/format'
import { fromCents, isMoneyInput, toCents } from '@/lib/money'
import type { InvoiceStats } from '@/features/invoices/types'

import { cancelInvoice, createInvoice, db, findInvoice, invoiceSummaryView, invoiceTotals, invoiceView, nextInvoiceNumber } from '../db'
import { API, fail, fileResponse, idParam, inDateRange, paginate, readBody, requireAdmin, requireUser, route } from '../http'
import { simplePdf } from '../pdf'

function filtered(url: URL) {
  const q = url.searchParams
  const search = q.get('search')?.trim().toLowerCase()
  const status = q.get('status')
  return db.invoices
    .filter((inv) => inDateRange(inv.created_at, q.get('start_date'), q.get('end_date')))
    .filter((inv) => !status || inv.status === status)
    .filter((inv) => !search || inv.invoice_number.toLowerCase().includes(search) || (inv.customer_name ?? 'walk-in customer').toLowerCase().includes(search))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export const invoiceHandlers = [
  http.get(
    `${API}/invoices`,
    route(({ request, url }) => {
      requireUser(request)
      return paginate(filtered(url).map(invoiceSummaryView), url)
    }),
  ),

  http.get(
    `${API}/invoices/summary`,
    route(({ request, url }): InvoiceStats => {
      requireUser(request)
      const inRange = db.invoices.filter((inv) => inDateRange(inv.created_at, url.searchParams.get('start_date'), url.searchParams.get('end_date')))
      const completed = inRange.filter((inv) => inv.status === 'COMPLETED')
      const cancelled = inRange.filter((inv) => inv.status === 'CANCELLED')
      const sum = (list: typeof inRange) => list.reduce((total, inv) => total + invoiceTotals(inv).total, 0)
      const sales = sum(completed)
      return {
        invoice_count: completed.length,
        total_sales: fromCents(sales),
        average_invoice: fromCents(completed.length ? Math.round(sales / completed.length) : 0),
        cancelled_count: cancelled.length,
        cancelled_total: fromCents(sum(cancelled)),
      }
    }),
  ),

  http.get(
    `${API}/invoices/next-number`,
    route(({ request }) => {
      requireUser(request)
      return { invoice_number: nextInvoiceNumber() }
    }),
  ),

  http.get(
    `${API}/invoices/:id`,
    route(({ request, params }) => {
      requireUser(request)
      return invoiceView(findInvoice(idParam(params)))
    }),
  ),

  http.post(
    `${API}/invoices`,
    route(async ({ request }) => {
      const user = requireUser(request)
      const input = await readBody<{
        customer_name?: string | null
        discount?: string
        items?: Array<{ product_id: number; quantity: number; unit_price?: string }>
      }>(request)
      const discount = input.discount ?? '0'
      if (!isMoneyInput(discount)) fail(422, 'INVALID_DISCOUNT', 'Enter the discount as an amount, e.g. 50.00.')
      for (const item of input.items ?? []) {
        if (item.unit_price !== undefined && !isMoneyInput(item.unit_price)) fail(422, 'INVALID_PRICE', 'Unit prices must be amounts, e.g. 19.00.')
      }
      const invoice = createInvoice({
        customer_name: input.customer_name ?? null,
        discount: toCents(discount),
        items: (input.items ?? []).map((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price === undefined ? null : toCents(item.unit_price),
        })),
        user,
      })
      return invoiceView(invoice)
    }),
  ),

  http.post(
    `${API}/invoices/:id/cancel`,
    route(({ request, params }) => {
      const admin = requireAdmin(request)
      return invoiceView(cancelInvoice(findInvoice(idParam(params)), admin))
    }),
  ),

  http.get(
    `${API}/invoices/:id/pdf`,
    route(({ request, params }) => {
      requireUser(request)
      const invoice = invoiceView(findInvoice(idParam(params)))
      const currency = db.settings.currency
      const money = (v: string) => formatMoney(v, currency)
      const pdf = simplePdf([
        { text: db.settings.business_name, size: 18, gap: 0 },
        ...db.settings.business_address.split('\n').map((text) => ({ text, size: 10, gap: 14 })),
        { text: `TAX INVOICE  ${invoice.invoice_number}`, size: 13, gap: 30 },
        { text: `Bill to: ${invoice.customer_name ?? 'Walk-in customer'}`, gap: 22 },
        { text: `Date: ${formatDocumentDateTime(invoice.created_at)}   Served by: ${invoice.user_name}` },
        ...invoice.items.map((item, i) => ({
          text: `${i + 1}. ${item.product_name} (${item.product_sku})  ${item.quantity} x ${money(item.unit_price)} = ${money(item.line_total)}`,
          gap: i === 0 ? 30 : 16,
        })),
        { text: `Subtotal: ${money(invoice.subtotal)}`, gap: 30 },
        { text: `Discount: ${money(invoice.discount)}` },
        { text: `VAT ${formatTaxRate(invoice.tax_rate)}: ${money(invoice.tax_amount)}` },
        { text: `Total due: ${money(invoice.total)}${invoice.status === 'CANCELLED' ? '  (CANCELLED)' : ''}`, size: 13, gap: 20 },
        { text: 'Generated by the IMS mock API. The real backend renders this with WeasyPrint.', size: 8, gap: 40 },
      ])
      return fileResponse(pdf, `${invoice.invoice_number}.pdf`, 'application/pdf')
    }),
  ),
]
