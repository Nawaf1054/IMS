import { apiClient, type Query } from '@/lib/api-client'
import type { DateRangeParams, Page } from '@/types/api'
import type { Invoice, InvoiceSummary } from '@/types/models'

import type { CreateInvoiceInput, InvoiceListParams, InvoiceStats } from '../types'

export const invoicesApi = {
  list: (params: InvoiceListParams) => apiClient.get<Page<InvoiceSummary>>('/invoices', params as Query),
  stats: (params: DateRangeParams) => apiClient.get<InvoiceStats>('/invoices/summary', params as Query),
  nextNumber: () => apiClient.get<{ invoice_number: string }>('/invoices/next-number'),
  get: (id: number) => apiClient.get<Invoice>(`/invoices/${id}`),
  create: (input: CreateInvoiceInput) => apiClient.post<Invoice>('/invoices', input),
  cancel: (id: number) => apiClient.post<Invoice>(`/invoices/${id}/cancel`),
  pdf: (id: number, number: string) => apiClient.download(`/invoices/${id}/pdf`, undefined, `${number}.pdf`),
  /** EXP-3 / EXP-5: same filters as the list. */
  export: (params: InvoiceListParams) => apiClient.download('/exports/invoices', params as Query, 'invoices.xlsx'),
}
