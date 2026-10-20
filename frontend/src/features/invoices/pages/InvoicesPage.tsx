/** /invoices: invoice list with search, status and date filters, header totals and Excel export. */
import { DownloadIcon, PlusIcon, ReceiptTextIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'

import { InvoiceStatusBadge } from '@/components/common/badges'
import { DateRangePicker } from '@/components/common/DateRangePicker'
import { Pagination } from '@/components/common/Pagination'
import { SearchInput } from '@/components/common/SearchInput'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { StatCard } from '@/components/common/StatCard'
import { EmptyState } from '@/components/feedback/EmptyState'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMoney } from '@/features/settings'
import { DEFAULT_PAGE_SIZE } from '@/config/constants'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { type DateRange, presetRange } from '@/lib/dates'
import { formatNumber, formatRange, formatRelativeDateTime, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { InvoiceStatus, InvoiceSummary } from '@/types/models'

import { useInvoices, useInvoiceStats } from '../api/queries'
import { useInvoiceExport } from '../hooks/use-invoice-export'

type StatusFilter = InvoiceStatus | 'ALL'

/** The customer name, or a muted "Walk-in customer". */
function Customer({ invoice }: { invoice: InvoiceSummary }) {
  return <span className={cn(!invoice.customer_name && 'text-muted-foreground')}>{invoice.customer_name ?? 'Walk-in customer'}</span>
}

/** Filterable, paged invoice list (INV-7). */
export function InvoicesPage() {
  const money = useMoney()
  const [searchDraft, setSearchDraft] = useState('')
  const search = useDebouncedValue(searchDraft.trim())
  const [range, setRange] = useState<DateRange>(() => presetRange('MTD'))
  const [status, setStatus] = useState<StatusFilter>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const { exportInvoices, exporting } = useInvoiceExport()

  const params = {
    search: search || undefined,
    status: status === 'ALL' ? undefined : status,
    start_date: range.start,
    end_date: range.end,
    page,
    page_size: pageSize,
  }
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useInvoices(params)
  const stats = useInvoiceStats({ start_date: range.start, end_date: range.end })
  const filtered = !!search || status !== 'ALL'
  const resetPage =
    <T,>(set: (v: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
    }

  return (
    <Page>
      <PageHeader
        title="Invoices"
        description="Invoices can’t be edited after saving. Admins can cancel one to restore its stock."
        actions={
          <>
            <Button
              variant="outline"
              disabled={exporting}
              onClick={() => exportInvoices(params, filtered ? `${data?.total ?? 0} rows · filters applied` : `All invoices · ${formatRange(range)}`)}
            >
              <DownloadIcon />
              {exporting ? 'Exporting…' : 'Export'}
            </Button>
            <Button asChild>
              <Link to="/invoices/new">
                <PlusIcon />
                New invoice
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatCard
          size="compact"
          loading={stats.isPending}
          label={`Invoices · ${formatShortDate(range.start)}–${formatShortDate(range.end)}`}
          value={stats.data && formatNumber(stats.data.invoice_count)}
        />
        <StatCard size="compact" loading={stats.isPending} label="Net sales incl. VAT" value={stats.data && money(stats.data.total_sales)} />
        <StatCard size="compact" loading={stats.isPending} label="Average invoice" value={stats.data && money(stats.data.average_invoice)} />
        <StatCard
          size="compact"
          loading={stats.isPending}
          label="Cancelled"
          value={
            stats.data && (
              <>
                {stats.data.cancelled_count} <span className="text-[13px] font-normal text-muted-foreground">· {money(stats.data.cancelled_total)}</span>
              </>
            )
          }
        />
      </div>

      <div role="search" className="flex flex-wrap items-center gap-2">
        <SearchInput
          label="Search invoices"
          placeholder="Invoice number or customer name"
          className="max-w-[380px] flex-[1_1_280px]"
          value={searchDraft}
          onChange={(e) => {
            setSearchDraft(e.target.value)
            setPage(1)
          }}
        />
        <DateRangePicker value={range} onChange={resetPage(setRange)} />
        <SegmentedControl<StatusFilter>
          label="Status"
          value={status}
          onChange={resetPage(setStatus)}
          options={[
            { value: 'ALL', label: 'All' },
            { value: 'COMPLETED', label: 'Completed' },
            { value: 'CANCELLED', label: 'Cancelled' },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : !isPending && data.items.length === 0 ? (
          <EmptyState
            icon={ReceiptTextIcon}
            title={filtered ? 'No invoices found' : 'No invoices yet'}
            description={filtered ? `Nothing matches${search ? ` “${search}”` : ''} in this date range.` : 'Sales you record will show up here.'}
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchDraft('')
                    setStatus('ALL')
                  }}
                >
                  Clear search
                </Button>
              ) : (
                <Link to="/invoices/new" className="text-[13px] font-medium text-primary-soft-foreground">
                  Create invoice
                </Link>
              )
            }
          />
        ) : (
          <>
            <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
              <div className="hidden md:block">
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-4">Invoice</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="px-4">Created by</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isPending
                      ? Array.from({ length: 10 }, (_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={7}>
                              <Skeleton className="h-4" />
                            </TableCell>
                          </TableRow>
                        ))
                      : data.items.map((invoice) => {
                          const cancelled = invoice.status === 'CANCELLED'
                          return (
                            <TableRow key={invoice.id}>
                              <TableCell className="px-4">
                                <Link to={`/invoices/${invoice.id}`} className="text-code font-medium text-primary-soft-foreground hover:text-primary">
                                  {invoice.invoice_number}
                                </Link>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-subtle-foreground">{formatRelativeDateTime(invoice.created_at)}</TableCell>
                              <TableCell>
                                <Customer invoice={invoice} />
                              </TableCell>
                              <TableCell className="text-right text-subtle-foreground">{invoice.item_count}</TableCell>
                              <TableCell className={cn('text-right font-medium whitespace-nowrap', cancelled && 'text-muted-foreground line-through')}>
                                {money(invoice.total)}
                              </TableCell>
                              <TableCell>
                                <InvoiceStatusBadge status={invoice.status} />
                              </TableCell>
                              <TableCell className="px-4 whitespace-nowrap text-subtle-foreground">{invoice.user_name}</TableCell>
                            </TableRow>
                          )
                        })}
                  </TableBody>
                </Table>
              </div>
              <ul className="md:hidden">
                {data?.items.map((invoice) => (
                  <li key={invoice.id} className="border-b last:border-b-0">
                    <Link to={`/invoices/${invoice.id}`} className="flex flex-col gap-1.5 px-4 py-3.5 text-foreground hover:bg-subtle">
                      <span className="flex justify-between gap-2">
                        <span className="text-code font-medium text-primary-soft-foreground">{invoice.invoice_number}</span>
                        <span className={cn('font-semibold', invoice.status === 'CANCELLED' && 'line-through')}>{money(invoice.total)}</span>
                      </span>
                      <span className="flex justify-between gap-2 text-[13px] text-subtle-foreground">
                        <Customer invoice={invoice} />
                        <InvoiceStatusBadge status={invoice.status} size="sm" />
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatRelativeDateTime(invoice.created_at)} · {invoice.item_count} items
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            {data && (
              <Pagination
                page={data.page}
                pageSize={data.page_size}
                total={data.total}
                onPageChange={setPage}
                onPageSizeChange={resetPage(setPageSize)}
                summary={filtered ? `${formatNumber(data.total)} matching invoices` : undefined}
              />
            )}
          </>
        )}
      </div>
    </Page>
  )
}
