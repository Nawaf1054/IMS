/**
 * Seed data for the mock API: the catalog, users and business from the UI design,
 * plus ~4 months of generated sales and stock history ending today. Generation is
 * deterministic (seeded PRNG) and every balance is consistent: stock never dips
 * below zero and each product ends at the quantity shown in the design.
 */
import type { MovementType, Role } from '@/types/models'

// ── Row types (internal storage; money in integer cents) ────────────────────

export interface UserRow {
  id: number
  name: string
  email: string
  role: Role
  is_active: boolean
  password: string
  created_at: string
  last_active_at: string | null
}

export interface CategoryRow {
  id: number
  name: string
  parent_id: number | null
  created_at: string
}

export interface ProductRow {
  id: number
  name: string
  sku: string
  category_id: number
  cost: number
  sell: number
  quantity: number
  min_quantity: number
  description: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface MovementRow {
  id: number
  product_id: number
  type: MovementType
  quantity: number
  balance_after: number
  note: string
  invoice_id: number | null
  user_id: number
  created_at: string
}

export interface InvoiceItemRow {
  id: number
  product_id: number
  quantity: number
  unit_price: number
}

export interface InvoiceRow {
  id: number
  invoice_number: string
  customer_name: string | null
  discount: number
  tax_rate: string
  items: InvoiceItemRow[]
  status: 'COMPLETED' | 'CANCELLED'
  user_id: number
  created_at: string
  cancelled_at: string | null
  cancelled_by: number | null
}

export interface SettingsRow {
  business_name: string
  business_address: string
  currency: string
  tax_rate: string
}

export interface Seed {
  users: UserRow[]
  categories: CategoryRow[]
  products: ProductRow[]
  movements: MovementRow[]
  invoices: InvoiceRow[]
  settings: SettingsRow
}

/** Password for every seeded account (documented in the README). */
export const SEED_PASSWORD = 'demo1234'

const HISTORY_DAYS = 120

// ── Deterministic randomness ────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── Fixed catalog ───────────────────────────────────────────────────────────

const CATEGORIES: Array<[number, string, number | null]> = [
  [1, 'Building Materials', null],
  [2, 'Plumbing', null],
  [3, 'Electrical', null],
  [4, 'Tools', null],
  [5, 'Power Tools', 4],
  [6, 'Hand Tools', 4],
  [7, 'Paint', null],
  [8, 'Safety', null],
  [9, 'Garden', null],
]

interface CatalogEntry {
  name: string
  sku: string
  category: number
  cost: number
  sell: number
  /** Quantity on hand today (matches the design). */
  quantity: number
  min: number
  /** Relative popularity on invoices. */
  weight: number
  /** Typical units per invoice line. */
  lineQty: [number, number]
  active?: boolean
  description?: string
}

const CATALOG: CatalogEntry[] = [
  {
    name: 'Portland cement 50kg bag',
    sku: 'BM-CEM-050',
    category: 1,
    cost: 1450,
    sell: 1900,
    quantity: 420,
    min: 100,
    weight: 10,
    lineQty: [5, 40],
    description: 'General-purpose Portland cement in 50kg bags for concrete, mortar and plaster work.',
  },
  {
    name: 'Steel rebar 12mm (12m)',
    sku: 'BM-RBR-012',
    category: 1,
    cost: 3800,
    sell: 4650,
    quantity: 85,
    min: 120,
    weight: 6,
    lineQty: [2, 20],
    description: 'Deformed 12mm reinforcing bar, 12 metre lengths.',
  },
  { name: 'PVC pipe 4" (6m)', sku: 'PL-PVC-104', category: 2, cost: 4200, sell: 5800, quantity: 64, min: 40, weight: 3, lineQty: [1, 6] },
  { name: 'Ceramic floor tiles 60×60 (box)', sku: 'BM-TIL-6060', category: 1, cost: 3200, sell: 4500, quantity: 18, min: 30, weight: 4, lineQty: [2, 12] },
  { name: 'Wall paint 18L matte white', sku: 'PT-WAL-018', category: 7, cost: 13500, sell: 18900, quantity: 22, min: 15, weight: 2.5, lineQty: [1, 3] },
  {
    name: 'Cordless drill 18V',
    sku: 'TL-PWR-D18',
    category: 5,
    cost: 31000,
    sell: 44900,
    quantity: 4,
    min: 5,
    weight: 0.6,
    lineQty: [1, 2],
    description:
      'Cordless 18V drill driver for everyday drilling and screw driving on site or in the workshop. Variable speed and an adjustable clutch make it suitable for wood, metal and light masonry.',
  },
  { name: 'Drill bit set 19pc', sku: 'TL-HND-DB19', category: 6, cost: 2800, sell: 4500, quantity: 37, min: 10, weight: 1.5, lineQty: [1, 2] },
  { name: 'Wood screws box 4×40mm (500)', sku: 'TL-HND-WS440', category: 6, cost: 1600, sell: 2500, quantity: 0, min: 20, weight: 3, lineQty: [1, 5] },
  { name: 'Electrical cable 2.5mm (100m)', sku: 'EL-CBL-25', category: 3, cost: 16500, sell: 22900, quantity: 12, min: 15, weight: 1, lineQty: [1, 2] },
  { name: 'Safety helmet', sku: 'SF-HLM-001', category: 8, cost: 1800, sell: 2900, quantity: 140, min: 30, weight: 3, lineQty: [1, 6] },
  { name: 'Gate valve 1" brass', sku: 'PL-VLV-001', category: 2, cost: 2400, sell: 3600, quantity: 3, min: 10, weight: 1, lineQty: [1, 3] },
  { name: 'Concrete block 20×20×40', sku: 'BM-BLK-2040', category: 1, cost: 210, sell: 325, quantity: 2600, min: 500, weight: 3, lineQty: [20, 200] },
  { name: 'Gypsum board 12.5mm (1.2×2.4m)', sku: 'BM-GYP-125', category: 1, cost: 2100, sell: 2950, quantity: 156, min: 40, weight: 1.5, lineQty: [2, 15] },
  { name: 'Tile adhesive 20kg', sku: 'BM-ADH-020', category: 1, cost: 1700, sell: 2400, quantity: 74, min: 25, weight: 2, lineQty: [2, 10] },
  { name: 'PVC elbow 4" 90°', sku: 'PL-ELB-104', category: 2, cost: 420, sell: 750, quantity: 310, min: 60, weight: 2, lineQty: [2, 12] },
  { name: 'Circuit breaker 32A', sku: 'EL-BRK-032', category: 3, cost: 1900, sell: 3200, quantity: 48, min: 20, weight: 1.2, lineQty: [1, 4] },
  { name: 'LED panel light 60×60 40W', sku: 'EL-LED-6040', category: 3, cost: 4600, sell: 7200, quantity: 33, min: 10, weight: 1, lineQty: [1, 6] },
  { name: 'Paint roller set 9"', sku: 'PT-ROL-009', category: 7, cost: 1400, sell: 2400, quantity: 61, min: 15, weight: 1.5, lineQty: [1, 3] },
  { name: 'Work gloves (pair)', sku: 'SF-GLV-010', category: 8, cost: 600, sell: 1100, quantity: 230, min: 50, weight: 2.5, lineQty: [2, 12] },
  {
    name: 'Angle grinder 115mm (old model)',
    sku: 'TL-PWR-AG115',
    category: 5,
    cost: 12000,
    sell: 17900,
    quantity: 0,
    min: 0,
    weight: 0.5,
    lineQty: [1, 1],
    active: false,
  },
]

const CUSTOMERS = ['Al-Mutairi Contracting', 'Saad Al-Dosari', 'Riyadh Fit-Out Co.', 'Omar Haddad', 'Nasser Building Works', 'Khalid Al-Shehri']

// ── Generation ──────────────────────────────────────────────────────────────

interface DraftMovement extends Omit<MovementRow, 'id' | 'balance_after'> {
  /** Deliveries and opening stock can be resized to reconcile balances. */
  adjustable: boolean
  at: number
}

function atTime(day: Date, hours: number, minutes: number): Date {
  const d = new Date(day)
  d.setHours(hours, minutes, 0, 0)
  return d
}

export function createSeed(now = new Date()): Seed {
  const rand = mulberry32(20261008)
  const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1))
  const pick = <T>(items: T[]) => items[Math.floor(rand() * items.length)]
  const iso = (d: Date) => d.toISOString()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayAt = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset)

  const users: UserRow[] = [
    {
      id: 1,
      name: 'Fahad Al-Harbi',
      email: 'fahad@alnoor-supplies.sa',
      role: 'admin',
      is_active: true,
      password: SEED_PASSWORD,
      created_at: iso(dayAt(-400)),
      last_active_at: iso(atTime(today, 11, 24)),
    },
    {
      id: 2,
      name: 'Noura Al-Qahtani',
      email: 'noura@alnoor-supplies.sa',
      role: 'staff',
      is_active: true,
      password: SEED_PASSWORD,
      created_at: iso(dayAt(-380)),
      last_active_at: iso(atTime(today, 11, 8)),
    },
    {
      id: 3,
      name: 'Majed Al-Otaibi',
      email: 'majed@alnoor-supplies.sa',
      role: 'staff',
      is_active: true,
      password: SEED_PASSWORD,
      created_at: iso(dayAt(-200)),
      last_active_at: iso(atTime(dayAt(-1), 17, 50)),
    },
    {
      id: 4,
      name: 'Huda Al-Zahrani',
      email: 'huda@alnoor-supplies.sa',
      role: 'admin',
      is_active: true,
      password: SEED_PASSWORD,
      created_at: iso(dayAt(-150)),
      last_active_at: iso(atTime(dayAt(-5), 9, 12)),
    },
    {
      id: 5,
      name: 'Yousef Al-Ghamdi',
      email: 'yousef@alnoor-supplies.sa',
      role: 'staff',
      is_active: false,
      password: SEED_PASSWORD,
      created_at: iso(dayAt(-300)),
      last_active_at: iso(atTime(dayAt(-48), 16, 40)),
    },
  ]
  const sellers = [2, 2, 2, 2, 2, 2, 1, 1, 1, 3]

  const categories: CategoryRow[] = CATEGORIES.map(([id, name, parent_id]) => ({ id, name, parent_id, created_at: iso(dayAt(-400)) }))

  const products: ProductRow[] = CATALOG.map((c, i) => ({
    id: i + 1,
    name: c.name,
    sku: c.sku,
    category_id: c.category,
    cost: c.cost,
    sell: c.sell,
    quantity: c.quantity,
    min_quantity: c.min,
    description: c.description ?? '',
    is_active: c.active ?? true,
    created_at: iso(dayAt(-250 + i * 3)),
    updated_at: iso(dayAt(-between(5, 40))),
  }))

  const totalWeight = (day: number) => CATALOG.reduce((sum, c) => sum + (c.active === false && day > -60 ? 0 : c.weight), 0)
  const pickProduct = (day: number) => {
    let r = rand() * totalWeight(day)
    for (let i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].active === false && day > -60) continue
      r -= CATALOG[i].weight
      if (r <= 0) return i
    }
    return 0
  }

  // 1. Sales: invoices with their SALE movements (and reversals for cancelled ones).
  const invoices: InvoiceRow[] = []
  const drafts: DraftMovement[] = []
  const sequence = new Map<number, number>()
  let itemId = 1

  for (let day = -HISTORY_DAYS; day <= 0; day++) {
    const date = dayAt(day)
    const weekday = date.getDay()
    let count = 12 + between(0, 6)
    if (weekday === 5) count = Math.round(count * 0.45)
    if (weekday === 6) count = Math.round(count * 1.15)

    const times = Array.from({ length: count }, () => between(8 * 60, 20 * 60)).sort((a, b) => a - b)
    for (const minutes of times) {
      const createdAt = atTime(date, Math.floor(minutes / 60), minutes % 60)
      if (createdAt > now) break

      const lines = new Map<number, number>()
      const lineCount = Math.min(5, 1 + Math.floor(rand() * rand() * 5))
      for (let l = 0; l < lineCount; l++) {
        const index = pickProduct(day)
        const [lo, hi] = CATALOG[index].lineQty
        lines.set(index, (lines.get(index) ?? 0) + between(lo, hi))
      }

      const year = createdAt.getFullYear()
      const seq = (sequence.get(year) ?? 0) + 1
      sequence.set(year, seq)
      const id = invoices.length + 1
      const items = [...lines].map(([index, quantity]) => ({ id: itemId++, product_id: index + 1, quantity, unit_price: CATALOG[index].sell }))
      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
      const discount = rand() < 0.2 ? Math.round((subtotal * between(1, 5)) / 100 / 100) * 100 : 0
      const cancelled = rand() < 0.02 && day < 0
      const userId = pick(sellers)

      invoices.push({
        id,
        invoice_number: `INV-${year}-${String(seq).padStart(5, '0')}`,
        customer_name: rand() < 0.6 ? pick(CUSTOMERS) : null,
        discount,
        tax_rate: '0',
        items,
        status: cancelled ? 'CANCELLED' : 'COMPLETED',
        user_id: userId,
        created_at: iso(createdAt),
        cancelled_at: cancelled ? iso(new Date(createdAt.getTime() + 40 * 60_000)) : null,
        cancelled_by: cancelled ? 1 : null,
      })
      for (const item of items) {
        drafts.push({
          product_id: item.product_id,
          type: 'SALE',
          quantity: -item.quantity,
          note: '',
          invoice_id: id,
          user_id: userId,
          created_at: iso(createdAt),
          at: createdAt.getTime(),
          adjustable: false,
        })
        if (cancelled) {
          const at = createdAt.getTime() + 40 * 60_000
          drafts.push({
            product_id: item.product_id,
            type: 'IN',
            quantity: item.quantity,
            note: `Reversal: ${invoices[id - 1].invoice_number} cancelled`,
            invoice_id: id,
            user_id: 1,
            created_at: iso(new Date(at)),
            at,
            adjustable: false,
          })
        }
      }
    }
  }

  // 2. Occasional damage write-offs and count corrections.
  for (const product of products) {
    for (let day = -HISTORY_DAYS + 10; day < 0; day += between(25, 50)) {
      if (rand() < 0.5) continue
      const at = atTime(dayAt(day), between(8, 17), between(0, 59))
      const isOut = rand() < 0.6
      drafts.push({
        product_id: product.id,
        type: isOut ? 'OUT' : 'ADJUSTMENT',
        quantity: -between(1, 3),
        note: isOut ? pick(['Broken in handling', 'Damaged in storage', 'Returned to supplier, defective']) : 'Shelf count lower than system quantity',
        invoice_id: null,
        user_id: pick([1, 2]),
        created_at: iso(at),
        at: at.getTime(),
        adjustable: false,
      })
    }
  }

  // 3. Per product: deliveries keep stock positive, then balances reconcile to today's quantity.
  const movements: MovementRow[] = []
  let deliveryNote = 7700
  for (const product of products) {
    const list = drafts.filter((d) => d.product_id === product.id).sort((a, b) => a.at - b.at)
    const openingAt = atTime(dayAt(-HISTORY_DAYS - 1), 8, 0)
    const opening: DraftMovement = {
      product_id: product.id,
      type: 'IN',
      quantity: 0,
      note: 'Opening stock',
      invoice_id: null,
      user_id: 1,
      created_at: iso(openingAt),
      at: openingAt.getTime(),
      adjustable: true,
    }
    const timeline: DraftMovement[] = [opening]
    let balance = 0
    for (const draft of list) {
      if (balance + draft.quantity < 0) {
        const need = -(balance + draft.quantity)
        const batch = need + Math.max(product.min_quantity, Math.ceil(Math.abs(draft.quantity) * between(2, 4)))
        const at = draft.at - between(1, 3) * 3_600_000
        timeline.push({
          product_id: product.id,
          type: 'IN',
          quantity: batch,
          note: `Delivery note ${deliveryNote++}`,
          invoice_id: null,
          user_id: 1,
          created_at: iso(new Date(at)),
          at,
          adjustable: true,
        })
        balance += batch
      }
      timeline.push(draft)
      balance += draft.quantity
    }

    // Reconcile the simulated end balance with the target quantity.
    let excess = balance - product.quantity
    if (excess < 0) {
      // Short of the target: a larger delivery only raises later balances, so it's always safe.
      timeline[findLastAdjustable(timeline)].quantity += -excess
      excess = 0
    }
    if (excess > 0) {
      const balances: number[] = []
      let running = 0
      for (const m of timeline) balances.push((running += m.quantity))
      for (let i = timeline.length - 1; i >= 0 && excess > 0; i--) {
        if (!timeline[i].adjustable) continue
        const headroom = Math.min(timeline[i].quantity, ...balances.slice(i))
        const cut = Math.min(headroom, excess)
        if (cut <= 0) continue
        timeline[i].quantity -= cut
        for (let j = i; j < balances.length; j++) balances[j] -= cut
        excess -= cut
      }
    }

    let running = 0
    for (const m of timeline.sort((a, b) => a.at - b.at)) {
      if (m.adjustable && m.quantity <= 0) continue
      running += m.quantity
      movements.push({
        id: 0,
        product_id: m.product_id,
        type: m.type,
        quantity: m.quantity,
        balance_after: running,
        note: m.note,
        invoice_id: m.invoice_id,
        user_id: m.user_id,
        created_at: m.created_at,
      })
    }
    product.quantity = running
  }

  movements.sort((a, b) => a.created_at.localeCompare(b.created_at))
  movements.forEach((m, i) => (m.id = i + 1))

  return {
    users,
    categories,
    products,
    movements,
    invoices,
    settings: {
      business_name: 'Al Noor Building Supplies',
      business_address: 'Prince Sultan Road, Al Olaya District\nRiyadh 12211, Saudi Arabia',
      currency: 'SAR',
      tax_rate: '0',
    },
  }
}

function findLastAdjustable(timeline: DraftMovement[]): number {
  for (let i = timeline.length - 1; i >= 0; i--) if (timeline[i].adjustable) return i
  return 0
}
