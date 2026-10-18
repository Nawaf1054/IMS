import { useState } from 'react'
import { toast } from 'sonner'

import { saveBlob } from '@/lib/download'

import { invoicesApi } from '../api/invoices.api'
import type { InvoiceListParams } from '../types'

export function useInvoiceExport() {
  const [exporting, setExporting] = useState(false)

  const exportInvoices = async (params: InvoiceListParams, description: string) => {
    setExporting(true)
    try {
      const { blob, filename } = await invoicesApi.export({ ...params, page: undefined, page_size: undefined })
      saveBlob(blob, filename)
      toast.success(`Export ready · ${filename}`, { description })
    } catch (e) {
      toast.error('Export failed', { description: e instanceof Error ? e.message : undefined })
    } finally {
      setExporting(false)
    }
  }

  return { exportInvoices, exporting }
}

export function useInvoicePdf() {
  const [downloading, setDownloading] = useState(false)

  const download = async (id: number, number: string) => {
    setDownloading(true)
    try {
      const { blob, filename } = await invoicesApi.pdf(id, number)
      saveBlob(blob, filename)
      toast.success(`Downloaded ${filename}`, { description: 'A4 · generated on the server' })
    } catch (e) {
      toast.error('Couldn’t download the PDF', { description: e instanceof Error ? e.message : undefined })
    } finally {
      setDownloading(false)
    }
  }

  return { download, downloading }
}
