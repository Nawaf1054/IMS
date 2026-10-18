import { http } from 'msw'

import { isMoneyInput, toCents } from '@/lib/money'

import { db, findProduct, invoiceCount, movementView, productDetailView, productView } from '../db'
import { API, fail, idParam, inDateRange, paginate, readBody, requireAdmin, requireUser, route } from '../http'

interface ProductInput {
  name?: string
  sku?: string
  category_id?: number
  cost_price?: string
  sell_price?: string
  min_quantity?: number
  description?: string
  is_active?: boolean
}

const SORTABLE = {
  name: (p: ReturnType<typeof productView>) => p.name.toLowerCase(),
  sku: (p: ReturnType<typeof productView>) => p.sku,
  category: (p: ReturnType<typeof productView>) => p.category_path.toLowerCase(),
  cost_price: (p: ReturnType<typeof productView>) => Number(p.cost_price),
  sell_price: (p: ReturnType<typeof productView>) => Number(p.sell_price),
  quantity: (p: ReturnType<typeof productView>) => p.quantity,
} as const

function validate(input: ProductInput, exceptId?: number) {
  const errors: string[] = []
  const name = input.name?.trim()
  const sku = input.sku?.trim().toUpperCase()
  if (input.name !== undefined && !name) errors.push('Name is required.')
  if (input.sku !== undefined && !sku) errors.push('SKU is required.')
  if (sku) {
    const clash = db.products.find((p) => p.id !== exceptId && p.sku === sku)
    if (clash) fail(409, 'SKU_TAKEN', `${sku} is already used by “${clash.name}”.`)
  }
  if (input.category_id !== undefined && !db.categories.some((c) => c.id === input.category_id)) errors.push('Choose a category.')
  for (const field of ['cost_price', 'sell_price'] as const) {
    if (input[field] !== undefined && !isMoneyInput(String(input[field]))) errors.push('Prices must be zero or more, with up to two decimals.')
  }
  if (input.min_quantity !== undefined && (!Number.isInteger(input.min_quantity) || input.min_quantity < 0)) {
    errors.push('Minimum quantity must be a whole number, zero or more.')
  }
  if (errors.length) fail(422, 'VALIDATION_ERROR', errors[0])
  return { name, sku }
}

export const productHandlers = [
  http.get(
    `${API}/products`,
    route(({ request, url }) => {
      requireUser(request)
      const q = url.searchParams
      const search = q.get('search')?.trim().toLowerCase()
      const categoryId = Number(q.get('category_id')) || null
      const categoryIds = categoryId ? [categoryId, ...db.categories.filter((c) => c.parent_id === categoryId).map((c) => c.id)] : null
      const lowOnly = q.get('low_stock') === 'true'
      const includeInactive = q.get('include_inactive') === 'true'
      const sortKey = (q.get('sort') ?? 'name') as keyof typeof SORTABLE
      const direction = q.get('order') === 'desc' ? -1 : 1

      const rows = db.products
        .map(productView)
        .filter((p) => !search || p.name.toLowerCase().includes(search) || p.sku.toLowerCase().includes(search))
        .filter((p) => !categoryIds || categoryIds.includes(p.category_id))
        .filter((p) => !lowOnly || (p.is_active && p.is_low_stock))
        .filter((p) => includeInactive || p.is_active)
      const key = SORTABLE[sortKey] ?? SORTABLE.name
      rows.sort((a, b) => {
        const x = key(a)
        const y = key(b)
        return (x < y ? -1 : x > y ? 1 : 0) * direction
      })
      return paginate(rows, url)
    }),
  ),

  http.post(
    `${API}/products`,
    route(async ({ request }) => {
      requireAdmin(request)
      const input = await readBody<ProductInput>(request)
      const { name, sku } = validate({ ...input, name: input.name ?? '', sku: input.sku ?? '' })
      if (input.category_id === undefined) fail(422, 'VALIDATION_ERROR', 'Choose a category.')
      const now = new Date().toISOString()
      const product = {
        id: db.products.reduce((max, p) => Math.max(max, p.id), 0) + 1,
        name: name!,
        sku: sku!,
        category_id: input.category_id,
        cost: toCents(input.cost_price ?? '0'),
        sell: toCents(input.sell_price ?? '0'),
        // PRD-4: new products start empty; stock arrives through an IN movement.
        quantity: 0,
        min_quantity: input.min_quantity ?? 0,
        description: input.description?.trim() ?? '',
        is_active: input.is_active ?? true,
        created_at: now,
        updated_at: now,
      }
      db.products.push(product)
      return productView(product)
    }),
  ),

  http.get(
    `${API}/products/:id`,
    route(({ request, params }) => {
      requireUser(request)
      return productDetailView(findProduct(idParam(params)))
    }),
  ),

  http.patch(
    `${API}/products/:id`,
    route(async ({ request, params }) => {
      requireAdmin(request)
      const product = findProduct(idParam(params))
      const input = await readBody<ProductInput & { quantity?: unknown }>(request)
      if (input.quantity !== undefined) fail(422, 'QUANTITY_READ_ONLY', 'Quantity changes only through stock movements and invoices.')
      const { name, sku } = validate(input, product.id)
      if (name !== undefined) product.name = name
      if (sku !== undefined) product.sku = sku
      if (input.category_id !== undefined) product.category_id = input.category_id
      if (input.cost_price !== undefined) product.cost = toCents(input.cost_price)
      if (input.sell_price !== undefined) product.sell = toCents(input.sell_price)
      if (input.min_quantity !== undefined) product.min_quantity = input.min_quantity
      if (input.description !== undefined) product.description = input.description.trim()
      if (input.is_active !== undefined) product.is_active = input.is_active
      product.updated_at = new Date().toISOString()
      return productDetailView(product)
    }),
  ),

  http.delete(
    `${API}/products/:id`,
    route(({ request, params }) => {
      requireAdmin(request)
      const product = findProduct(idParam(params))
      // PRD-2: products that appear on invoices are deactivated instead of deleted.
      if (invoiceCount(product.id) > 0) {
        product.is_active = false
        product.updated_at = new Date().toISOString()
        return { result: 'deactivated' }
      }
      db.products = db.products.filter((p) => p.id !== product.id)
      db.movements = db.movements.filter((m) => m.product_id !== product.id)
      return { result: 'deleted' }
    }),
  ),

  http.get(
    `${API}/products/:id/movements`,
    route(({ request, params, url }) => {
      requireUser(request)
      const product = findProduct(idParam(params))
      const type = url.searchParams.get('type')
      const start = url.searchParams.get('start_date')
      const end = url.searchParams.get('end_date')
      const rows = db.movements
        .filter((m) => m.product_id === product.id && (!type || m.type === type) && inDateRange(m.created_at, start, end))
        .sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id)
        .map(movementView)
      return paginate(rows, url)
    }),
  ),
]
