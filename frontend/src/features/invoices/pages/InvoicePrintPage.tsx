import { ArrowLeftIcon, DownloadIcon, PrinterIcon } from 'lucide-react'
import { Link, useParams } from 'react-router'

import { QueryError } from '@/components/feedback/QueryError'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useSettings } from '@/features/settings'

import { useInvoice } from '../api/queries'
import { InvoiceDocument } from '../components/InvoiceDocument'
import { useInvoicePdf } from '../hooks/use-invoice-export'

/** Full-screen printable view (print CSS hides the toolbar). */
export function InvoicePrintPage() {
  const id = Number(useParams().id)
  const invoice = useInvoice(id)
  const settings = useSettings()
  const { download, downloading } = useInvoicePdf()

  return (
    <div className="min-h-svh bg-muted print:bg-white">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background px-4 py-3">
        <Button asChild variant="ghost">
          <Link to={`/invoices/${id}`}>
            <ArrowLeftIcon />
            Back to invoice
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!invoice.data || downloading}
            onClick={() => invoice.data && download(invoice.data.id, invoice.data.invoice_number)}
          >
            <DownloadIcon />
            Download PDF
          </Button>
          <Button disabled={!invoice.data || !settings.data} onClick={() => window.print()}>
            <PrinterIcon />
            Print
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto p-6 print:p-0">
        {invoice.isError ? (
          <QueryError error={invoice.error} onRetry={() => invoice.refetch()} />
        ) : invoice.data && settings.data ? (
          <InvoiceDocument invoice={invoice.data} settings={settings.data} />
        ) : (
          <Skeleton className="mx-auto h-[1123px] w-[794px] bg-card" />
        )}
      </div>
    </div>
  )
}
