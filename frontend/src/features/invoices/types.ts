import type { DateRangeParams, Money, PageParams } from '@/types/api'
import type { InvoiceStatus } from '@/types/models'

export interface InvoiceListParams extends PageParams, DateRangeParams {
  /** Matches invoice number or customer name (INV-7). */
  search?: string
  status?: InvoiceStatus
}

/** GET /invoices/summary: header figures for the invoices list. */
export interface InvoiceStats {
  invoice_count: number
  total_sales: Money
  average_invoice: Money
  cancelled_count: number
  cancelled_total: Money
}

export interface CreateInvoiceInput {
  customer_name: string | null
  discount: Money
  /** unit_price is only sent when an admin overrides the product price. */
  items: Array<{ product_id: number; quantity: number; unit_price?: Money }>
}
