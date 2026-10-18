/**
 * Invoice arithmetic for the draft shown while creating an invoice (INV-1).
 * Integer cents throughout; the backend recomputes and is the source of truth.
 */
import { applyRate } from '@/lib/money'

export interface DraftLine {
  quantity: number
  unitPriceCents: number
}

export interface InvoiceTotals {
  subtotal: number
  discount: number
  taxable: number
  tax: number
  total: number
}

export function lineTotal(line: DraftLine): number {
  return line.quantity * line.unitPriceCents
}

/** Discount comes off the subtotal before tax; tax is rounded half-up to the cent. */
export function computeTotals(lines: DraftLine[], discountCents: number, taxRate: string): InvoiceTotals {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line), 0)
  const discount = Math.min(Math.max(discountCents, 0), subtotal)
  const taxable = subtotal - discount
  const tax = applyRate(taxable, taxRate)
  return { subtotal, discount, taxable, tax, total: taxable + tax }
}
