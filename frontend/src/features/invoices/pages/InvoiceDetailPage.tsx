/** /invoices/:id: one invoice with its lines, totals and stock movements; print, PDF and cancel. */
import { CircleXIcon, DownloadIcon, PrinterIcon, ReceiptTextIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'

import { InvoiceStatusBadge, MovementTypeBadge } from '@/components/common/badges'
import { Panel } from '@/components/common/Panel'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useIsAdmin } from '@/features/auth'
import { useMoney } from '@/features/settings'
import { isApiError } from '@/lib/api-client'
import { formatDateTime, formatDocumentDateTime, formatRelativeDateTime, formatSignedQuantity, formatTaxRate } from '@/lib/format'
import { fromCents, toCents } from '@/lib/money'
import { cn } from '@/lib/utils'

import { useCancelInvoice, useInvoice } from '../api/queries'
import { useInvoicePdf } from '../hooks/use-invoice-export'

/** Invoice detail. Admins can cancel a completed invoice after confirming. */
export function InvoiceDetailPage() {
  const id = Number(useParams().id)
  const isAdmin = useIsAdmin()
  const money = useMoney()
  const { data: invoice, isPending, isError, error, refetch } = useInvoice(id)
  const cancel = useCancelInvoice()
  const { download, downloading } = useInvoicePdf()
  const [confirmOpen, setConfirmOpen] = useState(false)

  if (isError) {
    return (
      <Page>
        {isApiError(error, 'INVOICE_NOT_FOUND') ? (
          <EmptyState
            bordered
            icon={ReceiptTextIcon}
            title="Invoice not found"
            action={
              <Link to="/invoices" className="text-[13px] font-medium text-primary-soft-foreground">
                Back to invoices
              </Link>
            }
          />
        ) : (
          <QueryError error={error} onRetry={() => refetch()} />
        )}
      </Page>
    )
  }
  if (isPending) {
    return (
      <Page width="xl">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-[480px]" />
      </Page>
    )
  }

  const cancelled = invoice.status === 'CANCELLED'
  const units = invoice.items.reduce((sum, item) => sum + item.quantity, 0)
  const taxable = fromCents(toCents(invoice.subtotal) - toCents(invoice.discount))

  const doCancel = () =>
    cancel.mutate(invoice.id, {
      onSuccess: () => {
        setConfirmOpen(false)
        toast.success('Invoice cancelled', { description: `${units} units restored to stock` })
      },
      onError: (e) => toast.error('Couldn’t cancel invoice', { description: e.message }),
    })

  return (
    <Page width="xl" className="gap-5">
      <PageHeader
        breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: invoice.invoice_number }]}
        title={<span className="font-mono tracking-[-0.02em]">{invoice.invoice_number}</span>}
        meta={<InvoiceStatusBadge status={invoice.status} />}
        description={`${formatDocumentDateTime(invoice.created_at)} · created by ${invoice.user_name}`}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/invoices/${invoice.id}/print`}>
                <PrinterIcon />
                Print
              </Link>
            </Button>
            <Button variant="outline" disabled={downloading} onClick={() => download(invoice.id, invoice.invoice_number)}>
              <DownloadIcon />
              {downloading ? 'Downloading…' : 'Download PDF'}
            </Button>
            {isAdmin && !cancelled && (
              <Button variant="destructive-outline" onClick={() => setConfirmOpen(true)}>
                Cancel invoice
              </Button>
            )}
          </>
        }
      />

      {cancelled && (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-soft px-3.5 py-3">
          <CircleXIcon className="mt-px size-[18px] shrink-0 text-danger" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <strong className="font-semibold text-danger">
              Cancelled{invoice.cancelled_by_name && ` by ${invoice.cancelled_by_name}`}
              {invoice.cancelled_at && ` · ${formatRelativeDateTime(invoice.cancelled_at).toLowerCase()}`}
            </strong>
            <span className="text-[13px] text-subtle-foreground">
              {units} units returned to stock through {invoice.items.length} reverse movements. This invoice no longer counts toward sales.
            </span>
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 px-5 py-[18px]">
            <div>
              <div className="text-xs text-muted-foreground">Customer</div>
              <div className={cn('font-medium', !invoice.customer_name && 'text-muted-foreground')}>{invoice.customer_name ?? 'Walk-in customer'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div>{formatDateTime(invoice.created_at)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Items</div>
              <div>
                {invoice.items.length} lines · {units} units
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">VAT rate</div>
              <div>{formatTaxRate(invoice.tax_rate)}</div>
            </div>
          </Panel>

          <Panel aria-labelledby="items-heading" className="overflow-hidden">
            <h2 id="items-heading" className="text-section-title border-b px-5 py-3.5">
              Items
            </h2>
            <Table className="min-w-[560px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="px-5">Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="px-5 text-right">Line total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="px-5 py-2.5">
                      <Link to={`/products/${item.product_id}`} className="block font-medium text-foreground hover:text-primary-soft-foreground">
                        {item.product_name}
                      </Link>
                      <span className="font-mono text-xs text-muted-foreground">{item.product_sku}</span>
                    </TableCell>
                    <TableCell className="text-right">{item.quantity}</TableCell>
                    <TableCell className="text-right text-subtle-foreground">{money(item.unit_price)}</TableCell>
                    <TableCell className="px-5 text-right font-medium">{money(item.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end px-5 py-4">
              <dl className="flex w-full max-w-[300px] flex-col gap-2">
                <div className="flex justify-between">
                  <dt className="text-subtle-foreground">Subtotal</dt>
                  <dd>{money(invoice.subtotal)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-subtle-foreground">Discount</dt>
                  <dd>− {money(invoice.discount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-subtle-foreground">
                    VAT {formatTaxRate(invoice.tax_rate)} on {money(taxable)}
                  </dt>
                  <dd>{money(invoice.tax_amount)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t pt-2.5">
                  <dt className="font-semibold">Total</dt>
                  <dd className={cn('text-[22px] leading-7 font-semibold', cancelled && 'text-muted-foreground line-through')}>{money(invoice.total)}</dd>
                </div>
              </dl>
            </div>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel aria-labelledby="movements-heading" className="flex flex-col gap-3 px-5 py-[18px]">
            <h2 id="movements-heading" className="text-section-title">
              Stock movements
            </h2>
            {invoice.movements.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 text-[13px]">
                <MovementTypeBadge type={m.type} compact />
                <span className="min-w-0 flex-1 truncate">
                  {m.product_name}
                  {m.type === 'IN' && ' · reversal'}
                </span>
                <span className={cn('font-semibold', m.quantity > 0 ? 'text-success' : 'text-foreground')}>{formatSignedQuantity(m.quantity)}</span>
              </div>
            ))}
            <Link to="/stock" className="text-[13px] font-medium text-primary-soft-foreground hover:text-primary">
              View in stock history
            </Link>
          </Panel>
          <Panel className="flex flex-col gap-2.5 px-5 py-[18px] text-[13px]">
            <h2 className="text-section-title">Activity</h2>
            {cancelled && invoice.cancelled_at && (
              <div className="flex gap-2.5">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
                <span>
                  Cancelled by {invoice.cancelled_by_name}
                  <br />
                  <span className="text-muted-foreground">{formatRelativeDateTime(invoice.cancelled_at)}</span>
                </span>
              </div>
            )}
            <div className="flex gap-2.5">
              <span className="mt-1.5 size-2 shrink-0 rounded-full bg-success" aria-hidden="true" />
              <span>
                Created by {invoice.user_name}
                <br />
                <span className="text-muted-foreground">{formatRelativeDateTime(invoice.created_at)}</span>
              </span>
            </div>
          </Panel>
          {!isAdmin && !cancelled && (
            <p className="text-xs text-muted-foreground">Need to reverse this sale? Ask an admin to cancel it; stock is restored automatically.</p>
          )}
        </aside>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        className="sm:max-w-[480px]"
        title={`Cancel ${invoice.invoice_number}?`}
        description={
          <>
            The invoice will be marked <strong className="font-semibold text-foreground">Cancelled</strong> and kept for the record. These quantities go back
            into stock:
          </>
        }
        cancelLabel="Keep invoice"
        confirmLabel="Cancel and restore stock"
        onConfirm={doCancel}
        pending={cancel.isPending}
      >
        <div className="flex flex-col gap-1.5 rounded-lg border px-3 py-2 text-[13px]">
          {invoice.items.map((item) => (
            <div key={item.id} className="flex justify-between gap-3">
              <span>{item.product_name}</span>
              <span className="font-semibold text-success">+{item.quantity}</span>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">This can’t be undone. To sell these items again, create a new invoice.</p>
      </ConfirmDialog>
    </Page>
  )
}
