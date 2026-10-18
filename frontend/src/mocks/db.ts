/**
 * In-memory database behind the mock API. It applies the same business rules the
 * backend must enforce (PRD §6) so the UI can be built and tested against them:
 * quantities change only through movements, never below zero; invoices save
 * atomically; cancelling restores stock with reverse movements.
 */
import { applyRate, fromCents } from '@/lib/money'
import type { Category, Invoice, InvoiceSummary, MovementType, Product, ProductDetail, StockMovement, User } from '@/types/models'

import { createSeed, type InvoiceRow, type MovementRow, type ProductRow, type UserRow } from './data/seed'
import { fail } from './errors'

const seed = createSeed()

export const db = {
  ...seed,
  /** Timestamps of AI requests per user, for the hourly rate limit (AI-8). */
  aiUsage: new Map<number, number[]>(),
}

const nextId = (rows: Array<{ id: number }>) => rows.reduce((max, r) => Math.max(max, r.id), 0) + 1

// ── Lookups ─────────────────────────────────────────────────────────────────

export function findUser(id: number): UserRow {
  return db.users.find((u) => u.id === id) ?? fail(404, 'USER_NOT_FOUND', 'User not found.')
}

export function findProduct(id: number): ProductRow {
  return db.products.find((p) => p.id === id) ?? fail(404, 'PRODUCT_NOT_FOUND', 'Product not found.')
}

export function findInvoice(id: number): InvoiceRow {
  return db.invoices.find((i) => i.id === id) ?? fail(404, 'INVOICE_NOT_FOUND', 'Invoice not found.')
}

/** Top-level category id (a subcategory rolls up into its parent). */
export function rootCategoryId(categoryId: number): number {
  const category = db.categories.find((c) => c.id === categoryId)
  return category?.parent_id ?? categoryId
}

// ── Views (rows → API shapes) ───────────────────────────────────────────────

export function userView(u: UserRow): User {
  return { id: u.id, name: u.name, email: u.email, role: u.role, is_active: u.is_active, created_at: u.created_at, last_active_at: u.last_active_at }
}

export function categoryView(c: (typeof db.categories)[number]): Category {
  return { ...c, product_count: db.products.filter((p) => p.category_id === c.id).length }
}

function categoryPath(categoryId: number): string {
  const category = db.categories.find((c) => c.id === categoryId)
  if (!category) return ''
  const parent = category.parent_id ? db.categories.find((c) => c.id === category.parent_id) : undefined
  return parent ? `${parent.name} › ${category.name}` : category.name
}

export function invoiceCount(productId: number): number {
  return db.invoices.filter((inv) => inv.items.some((item) => item.product_id === productId)).length
}

export function productView(p: ProductRow): Product {
  return {
    id: p.id,
    name: p.name,
    sku: p.sku,
    category_id: p.category_id,
    category_name: db.categories.find((c) => c.id === p.category_id)?.name ?? '',
    category_path: categoryPath(p.category_id),
    cost_price: fromCents(p.cost),
    sell_price: fromCents(p.sell),
    quantity: p.quantity,
    min_quantity: p.min_quantity,
    description: p.description,
    is_active: p.is_active,
    is_low_stock: p.quantity <= p.min_quantity,
    invoice_count: invoiceCount(p.id),
    created_at: p.created_at,
    updated_at: p.updated_at,
  }
}

export function productDetailView(p: ProductRow): ProductDetail {
  const since = Date.now() - 30 * 86_400_000
  const recent = db.invoices.filter((inv) => new Date(inv.created_at).getTime() >= since && inv.items.some((i) => i.product_id === p.id))
  let quantity = 0
  let revenue = 0
  for (const inv of recent) {
    if (inv.status !== 'COMPLETED') continue
    for (const item of inv.items) {
      if (item.product_id !== p.id) continue
      quantity += item.quantity
      revenue += item.quantity * item.unit_price
    }
  }
  const lastReceived = db.movements.filter((m) => m.product_id === p.id && m.type === 'IN' && !m.invoice_id).at(-1)
  return {
    ...productView(p),
    sales_last_30_days: {
      quantity,
      revenue: fromCents(revenue),
      invoice_count: recent.filter((inv) => inv.status === 'COMPLETED').length,
      cancelled_count: recent.filter((inv) => inv.status === 'CANCELLED').length,
    },
    last_received_at: lastReceived?.created_at ?? null,
  }
}

export function movementView(m: MovementRow): StockMovement {
  const product = db.products.find((p) => p.id === m.product_id)
  const invoice = m.invoice_id ? db.invoices.find((i) => i.id === m.invoice_id) : undefined
  return {
    id: m.id,
    product_id: m.product_id,
    product_name: product?.name ?? '',
    product_sku: product?.sku ?? '',
    type: m.type,
    quantity: m.quantity,
    balance_after: m.balance_after,
    note: m.note,
    invoice_id: m.invoice_id,
    invoice_number: invoice?.invoice_number ?? null,
    user_id: m.user_id,
    user_name: db.users.find((u) => u.id === m.user_id)?.name ?? '',
    created_at: m.created_at,
  }
}

export function invoiceTotals(inv: InvoiceRow) {
  const subtotal = inv.items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
  const taxable = subtotal - inv.discount
  const tax = applyRate(taxable, inv.tax_rate)
  return { subtotal, taxable, tax, total: taxable + tax }
}

export function invoiceSummaryView(inv: InvoiceRow): InvoiceSummary {
  return {
    id: inv.id,
    invoice_number: inv.invoice_number,
    customer_name: inv.customer_name,
    item_count: inv.items.length,
    total: fromCents(invoiceTotals(inv).total),
    status: inv.status,
    user_name: db.users.find((u) => u.id === inv.user_id)?.name ?? '',
    created_at: inv.created_at,
  }
}

export function invoiceView(inv: InvoiceRow): Invoice {
  const totals = invoiceTotals(inv)
  return {
    ...invoiceSummaryView(inv),
    subtotal: fromCents(totals.subtotal),
    discount: fromCents(inv.discount),
    tax_rate: inv.tax_rate,
    tax_amount: fromCents(totals.tax),
    items: inv.items.map((item) => {
      const product = db.products.find((p) => p.id === item.product_id)
      return {
        id: item.id,
        product_id: item.product_id,
        product_name: product?.name ?? '',
        product_sku: product?.sku ?? '',
        quantity: item.quantity,
        unit_price: fromCents(item.unit_price),
        line_total: fromCents(item.quantity * item.unit_price),
      }
    }),
    movements: db.movements.filter((m) => m.invoice_id === inv.id).map(movementView),
    cancelled_at: inv.cancelled_at,
    cancelled_by_name: inv.cancelled_by ? (db.users.find((u) => u.id === inv.cancelled_by)?.name ?? null) : null,
  }
}

// ── Stock (STK-1 … STK-6) ───────────────────────────────────────────────────

function appendMovement(
  product: ProductRow,
  type: MovementType,
  delta: number,
  note: string,
  userId: number,
  invoiceId: number | null,
  at: string,
): MovementRow {
  product.quantity += delta
  product.updated_at = at
  const row: MovementRow = {
    id: nextId(db.movements),
    product_id: product.id,
    type,
    quantity: delta,
    balance_after: product.quantity,
    note,
    invoice_id: invoiceId,
    user_id: userId,
    created_at: at,
  }
  db.movements.push(row)
  return row
}

/**
 * Manual movement. IN/OUT take the amount moved; ADJUSTMENT takes the counted
 * quantity on hand and records the difference.
 */
export function recordMovement(input: { product_id: number; type: MovementType; quantity: number; note: string; user: UserRow }): MovementRow {
  const product = findProduct(input.product_id)
  const { type, quantity } = input
  const note = input.note.trim()
  if (type === 'SALE') fail(422, 'SALE_NOT_ALLOWED', 'SALE movements are created automatically by invoices.')
  if (!Number.isInteger(quantity) || quantity < 0 || (type !== 'ADJUSTMENT' && quantity === 0)) {
    fail(422, 'INVALID_QUANTITY', 'Enter a quantity greater than zero.')
  }
  if (type !== 'IN' && !note) fail(422, 'NOTE_REQUIRED', 'Add a note explaining this movement.')

  const delta = type === 'IN' ? quantity : type === 'OUT' ? -quantity : quantity - product.quantity
  if (type === 'ADJUSTMENT' && delta === 0) fail(422, 'NO_CHANGE', `The counted quantity matches the system (${product.quantity}).`)
  if (product.quantity + delta < 0) {
    fail(409, 'INSUFFICIENT_STOCK', `Only ${product.quantity} in stock. Quantity can’t go below zero.`)
  }
  return appendMovement(product, type, delta, note, input.user.id, null, new Date().toISOString())
}

// ── Invoices (INV-1 … INV-7) ────────────────────────────────────────────────

export function nextInvoiceNumber(date = new Date()): string {
  const year = date.getFullYear()
  const prefix = `INV-${year}-`
  const last = db.invoices
    .filter((inv) => inv.invoice_number.startsWith(prefix))
    .reduce((max, inv) => Math.max(max, Number(inv.invoice_number.slice(prefix.length))), 0)
  return `${prefix}${String(last + 1).padStart(5, '0')}`
}

export function createInvoice(input: {
  customer_name: string | null
  discount: number
  items: Array<{ product_id: number; quantity: number; unit_price: number | null }>
  user: UserRow
}): InvoiceRow {
  if (!input.items.length) fail(422, 'EMPTY_INVOICE', 'Add at least one product.')

  // Validate everything before touching stock: one failure rolls back the whole invoice (INV-4).
  const merged = new Map<number, { quantity: number; unit_price: number | null }>()
  for (const item of input.items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) fail(422, 'INVALID_QUANTITY', 'Each line needs a quantity of at least 1.')
    const current = merged.get(item.product_id)
    merged.set(item.product_id, { quantity: (current?.quantity ?? 0) + item.quantity, unit_price: item.unit_price ?? current?.unit_price ?? null })
  }
  const lines = [...merged].map(([productId, line]) => {
    const product = findProduct(productId)
    if (!product.is_active) fail(422, 'PRODUCT_INACTIVE', `${product.name} is inactive and can’t be sold.`)
    if (line.quantity > product.quantity) {
      fail(409, 'INSUFFICIENT_STOCK', `Insufficient stock for ${product.name}: only ${product.quantity} available.`)
    }
    const overridden = line.unit_price !== null && line.unit_price !== product.sell
    if (overridden && input.user.role !== 'admin') fail(403, 'FORBIDDEN', 'Only admins can change prices.')
    if (line.unit_price !== null && line.unit_price < 0) fail(422, 'INVALID_PRICE', 'Unit price can’t be negative.')
    return { product, quantity: line.quantity, unit_price: line.unit_price ?? product.sell }
  })

  const subtotal = lines.reduce((sum, l) => sum + l.quantity * l.unit_price, 0)
  if (input.discount < 0) fail(422, 'INVALID_DISCOUNT', 'Discount can’t be negative.')
  if (input.discount > subtotal) fail(422, 'INVALID_DISCOUNT', 'Discount can’t exceed the subtotal.')

  const now = new Date()
  const id = nextId(db.invoices)
  let itemId = db.invoices.reduce((max, inv) => Math.max(max, ...inv.items.map((i) => i.id)), 0)
  const invoice: InvoiceRow = {
    id,
    invoice_number: nextInvoiceNumber(now),
    customer_name: input.customer_name?.trim() || null,
    discount: input.discount,
    tax_rate: db.settings.tax_rate,
    items: lines.map((l) => ({ id: ++itemId, product_id: l.product.id, quantity: l.quantity, unit_price: l.unit_price })),
    status: 'COMPLETED',
    user_id: input.user.id,
    created_at: now.toISOString(),
    cancelled_at: null,
    cancelled_by: null,
  }
  db.invoices.push(invoice)
  for (const line of lines) appendMovement(line.product, 'SALE', -line.quantity, '', input.user.id, id, invoice.created_at)
  return invoice
}

export function cancelInvoice(invoice: InvoiceRow, user: UserRow): InvoiceRow {
  if (invoice.status === 'CANCELLED') fail(409, 'ALREADY_CANCELLED', 'This invoice is already cancelled.')
  const at = new Date().toISOString()
  for (const item of invoice.items) {
    appendMovement(findProduct(item.product_id), 'IN', item.quantity, `Reversal: ${invoice.invoice_number} cancelled`, user.id, invoice.id, at)
  }
  invoice.status = 'CANCELLED'
  invoice.cancelled_at = at
  invoice.cancelled_by = user.id
  return invoice
}

// ── Analytics (DSH-1 … DSH-6). Figures come from recorded data, never from the LLM. ──

export function localDate(timestamp: string | Date): string {
  const d = new Date(timestamp)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function completedInvoices(start: string, end: string): InvoiceRow[] {
  return db.invoices.filter((inv) => {
    const day = localDate(inv.created_at)
    return inv.status === 'COMPLETED' && day >= start && day <= end
  })
}

export function salesTotals(start: string, end: string) {
  const list = completedInvoices(start, end)
  return { revenue: list.reduce((sum, inv) => sum + invoiceTotals(inv).total, 0), count: list.length }
}

/** Revenue (line totals) and units per product within a range. */
export function productSales(start: string, end: string) {
  const byProduct = new Map<number, { quantity: number; revenue: number }>()
  for (const inv of completedInvoices(start, end)) {
    for (const item of inv.items) {
      const row = byProduct.get(item.product_id) ?? { quantity: 0, revenue: 0 }
      row.quantity += item.quantity
      row.revenue += item.quantity * item.unit_price
      byProduct.set(item.product_id, row)
    }
  }
  return byProduct
}

export function lowStockProducts(): ProductRow[] {
  return db.products
    .filter((p) => p.is_active && p.quantity <= p.min_quantity)
    .sort((a, b) => a.quantity / Math.max(1, a.min_quantity) - b.quantity / Math.max(1, b.min_quantity))
}
