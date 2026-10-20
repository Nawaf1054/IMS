/** HTTP calls for the invoices endpoints. Components use the hooks in queries.ts rather than calling these directly. */
import { apiClient, type Query } from '@/lib/api-client'
import type { DateRangeParams, Page } from '@/types/api'
import type { Invoice, InvoiceSummary } from '@/types/models'

import type { CreateInvoiceInput, InvoiceListParams, InvoiceStats } from '../types'

/** Invoice endpoints. */
export const invoicesApi = {
  /** One page of invoices matching the filters. */
  list: (params: InvoiceListParams) => apiClient.get<Page<InvoiceSummary>>('/invoices', params as Query),
  /** Header totals for the invoices list. */
  stats: (params: DateRangeParams) => apiClient.get<InvoiceStats>('/invoices/summary', params as Query),
  /** Preview of the next invoice number. */
  nextNumber: () => apiClient.get<{ invoice_number: string }>('/invoices/next-number'),
  /** One invoice with its lines and stock movements. */
  get: (id: number) => apiClient.get<Invoice>(`/invoices/${id}`),
  /** Saves an invoice; the backend reduces stock in the same transaction. */
  create: (input: CreateInvoiceInput) => apiClient.post<Invoice>('/invoices', input),
  /** Admin: cancels an invoice and restores its stock. */
  cancel: (id: number) => apiClient.post<Invoice>(`/invoices/${id}/cancel`),
  /** Downloads the invoice as a PDF. */
  pdf: (id: number, number: string) => apiClient.download(`/invoices/${id}/pdf`, undefined, `${number}.pdf`),
  /** EXP-3 / EXP-5: same filters as the list. */
  export: (params: InvoiceListParams) => apiClient.download('/exports/invoices', params as Query, 'invoices.xlsx'),
}
