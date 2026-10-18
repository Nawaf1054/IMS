import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { DateRangeParams } from '@/types/api'

import type { CreateInvoiceInput, InvoiceListParams } from '../types'
import { invoicesApi } from './invoices.api'

export const invoiceKeys = {
  all: ['invoices'] as const,
  list: (params: InvoiceListParams) => ['invoices', 'list', params] as const,
  stats: (params: DateRangeParams) => ['invoices', 'stats', params] as const,
  nextNumber: ['invoices', 'next-number'] as const,
  detail: (id: number) => ['invoices', 'detail', id] as const,
}

export function useInvoices(params: InvoiceListParams) {
  return useQuery({ queryKey: invoiceKeys.list(params), queryFn: () => invoicesApi.list(params), placeholderData: keepPreviousData })
}

export function useInvoiceStats(params: DateRangeParams) {
  return useQuery({ queryKey: invoiceKeys.stats(params), queryFn: () => invoicesApi.stats(params) })
}

export function useNextInvoiceNumber() {
  return useQuery({ queryKey: invoiceKeys.nextNumber, queryFn: invoicesApi.nextNumber, select: (r) => r.invoice_number })
}

export function useInvoice(id: number) {
  return useQuery({ queryKey: invoiceKeys.detail(id), queryFn: () => invoicesApi.get(id), enabled: Number.isFinite(id) })
}

/** Saving or cancelling an invoice changes stock, so products, movements and the dashboard refresh too. */
function useInvalidateSales() {
  const queryClient = useQueryClient()
  return () => Promise.all([invoiceKeys.all, ['products'], ['stock-movements'], ['dashboard']].map((queryKey) => queryClient.invalidateQueries({ queryKey })))
}

export function useCreateInvoice() {
  const invalidate = useInvalidateSales()
  return useMutation({ mutationFn: (input: CreateInvoiceInput) => invoicesApi.create(input), onSuccess: invalidate })
}

export function useCancelInvoice() {
  const invalidate = useInvalidateSales()
  return useMutation({ mutationFn: (id: number) => invoicesApi.cancel(id), onSuccess: invalidate })
}
