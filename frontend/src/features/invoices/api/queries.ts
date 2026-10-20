/** TanStack Query hooks and cache keys for invoices. Mutations refresh the cached data they affect. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DateRangeParams } from '@/types/api'

import type { CreateInvoiceInput, InvoiceListParams } from '../types'
import { invoicesApi } from './invoices.api'

/** Cache keys for invoice data. */
export const invoiceKeys = {
  all: ['invoices'] as const,
  /** Key for one filtered page of invoices. */
  list: (params: InvoiceListParams) => ['invoices', 'list', params] as const,
  /** Key for the list header totals over a date range. */
  stats: (params: DateRangeParams) => ['invoices', 'stats', params] as const,
  nextNumber: ['invoices', 'next-number'] as const,
  /** Key for one invoice. */
  detail: (id: number) => ['invoices', 'detail', id] as const,
}

/** One page of invoices; keeps the previous page visible while the next loads. */
export function useInvoices(params: InvoiceListParams) {
  return useQuery({ queryKey: invoiceKeys.list(params), queryFn: () => invoicesApi.list(params), placeholderData: keepPreviousData })
}

/** Totals for the invoices list header. */
export function useInvoiceStats(params: DateRangeParams) {
  return useQuery({ queryKey: invoiceKeys.stats(params), queryFn: () => invoicesApi.stats(params) })
}

/** The number the next invoice will most likely get. */
export function useNextInvoiceNumber() {
  return useQuery({ queryKey: invoiceKeys.nextNumber, queryFn: invoicesApi.nextNumber, select: (r) => r.invoice_number })
}

/** One invoice (skipped while the id isn't a number yet). */
export function useInvoice(id: number) {
  return useQuery({ queryKey: invoiceKeys.detail(id), queryFn: () => invoicesApi.get(id), enabled: Number.isFinite(id) })
}

/** Saving or cancelling an invoice changes stock, so products, movements and the dashboard refresh too. */
function useInvalidateSales() {
  const queryClient = useQueryClient()
  return () => Promise.all([invoiceKeys.all, ['products'], ['stock-movements'], ['dashboard']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

/** Saves a new invoice. */
export function useCreateInvoice() {
  const invalidate = useInvalidateSales()
  return useMutation({ mutationFn: (input: CreateInvoiceInput) => invoicesApi.create(input), onSuccess: invalidate })
}

/** Cancels an invoice. */
export function useCancelInvoice() {
  const invalidate = useInvalidateSales()
  return useMutation({ mutationFn: (id: number) => invoicesApi.cancel(id), onSuccess: invalidate })
}
