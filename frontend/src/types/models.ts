/**
 * API entities shared across features. Field names match the backend JSON
 * (snake_case) so responses are used as-is, without a mapping layer.
 * Source of truth: docs/PRD.md §7 (data model) and §8 (endpoints).
 */
import type { Money } from './api'

// ── Users & auth ────────────────────────────────────────────────────────────

export type Role = 'admin' | 'staff'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  is_active: boolean
  created_at: string
  last_active_at: string | null
}

export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
}

export interface LoginResponse extends TokenPair {
  user: User
}

// ── Catalog ─────────────────────────────────────────────────────────────────

export interface Category {
  id: number
  name: string
  parent_id: number | null
  /** Products assigned directly to this category. */
  product_count: number
  created_at: string
}

export interface Product {
  id: number
  name: string
  sku: string
  category_id: number
  category_name: string
  /** Display path including the parent, e.g. "Tools › Power Tools". */
  category_path: string
  cost_price: Money
  sell_price: Money
  /** Read-only: changes only through stock movements and invoices (PRD-4). */
  quantity: number
  min_quantity: number
  description: string
  is_active: boolean
  /** quantity <= min_quantity (PRD-5). */
  is_low_stock: boolean
  /** Number of invoices this product appears on; > 0 means delete deactivates instead. */
  invoice_count: number
  created_at: string
  updated_at: string
}

export interface ProductDetail extends Product {
  sales_last_30_days: {
    quantity: number
    revenue: Money
    invoice_count: number
    cancelled_count: number
  }
  last_received_at: string | null
}

// ── Stock ───────────────────────────────────────────────────────────────────

export type MovementType = 'IN' | 'OUT' | 'ADJUSTMENT' | 'SALE'

export interface StockMovement {
  id: number
  product_id: number
  product_name: string
  product_sku: string
  type: MovementType
  /** Signed change in quantity: positive adds stock, negative removes it. */
  quantity: number
  /** Product quantity right after this movement. */
  balance_after: number
  note: string
  invoice_id: number | null
  invoice_number: string | null
  user_id: number
  user_name: string
  created_at: string
}

// ── Invoices ────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'COMPLETED' | 'CANCELLED'

export interface InvoiceSummary {
  id: number
  invoice_number: string
  customer_name: string | null
  item_count: number
  total: Money
  status: InvoiceStatus
  user_name: string
  created_at: string
}

export interface InvoiceItem {
  id: number
  product_id: number
  product_name: string
  product_sku: string
  quantity: number
  /** Price at the time of sale (INV-5). */
  unit_price: Money
  line_total: Money
}

export interface Invoice extends InvoiceSummary {
  subtotal: Money
  discount: Money
  /** Fraction, e.g. "0.15" for 15%. */
  tax_rate: string
  tax_amount: Money
  items: InvoiceItem[]
  movements: StockMovement[]
  cancelled_at: string | null
  cancelled_by_name: string | null
}

// ── Settings ────────────────────────────────────────────────────────────────

export interface BusinessSettings {
  business_name: string
  business_address: string
  currency: string
  /** Fraction, e.g. "0.15" for 15%. */
  tax_rate: string
}

// ── AI assistant ────────────────────────────────────────────────────────────

export interface AiQuota {
  limit: number
  remaining: number
  resets_at: string
}
