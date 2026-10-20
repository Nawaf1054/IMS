/** /stock: all stock movements with type and date filters, Excel export and the new-movement sheet. */
import { ArrowLeftRightIcon, DownloadIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'

import { DateRangePicker } from '@/components/common/DateRangePicker'
import { FilterChips } from '@/components/common/FilterChips'
import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/feedback/EmptyState'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { DEFAULT_PAGE_SIZE } from '@/config/constants'
import { type DateRange, presetRange } from '@/lib/dates'
import { saveBlob } from '@/lib/download'
import { formatNumber, formatRange } from '@/lib/format'
import type { MovementType } from '@/types/models'

import { useMovements } from '../api/queries'
import { stockApi } from '../api/stock.api'
import { MovementsTable } from '../components/MovementsTable'
import { NewMovementSheet } from '../components/NewMovementSheet'

type TypeFilter = MovementType | 'ALL'

/** Movement type filter chips. */
const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'ALL', label: 'All types' },
  { value: 'IN', label: 'IN' },
  { value: 'OUT', label: 'OUT' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
  { value: 'SALE', label: 'Sale' },
]

/** Movement list (STK-5). `?new=1&product=…&type=…` opens the form pre-filled. */
export function StockPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [range, setRange] = useState<DateRange>(() => presetRange('30D'))
  const [type, setType] = useState<TypeFilter>('ALL')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  // The movement panel lives in the URL: /stock?new=1&product=6&type=IN opens it prefilled.
  const sheetOpen = searchParams.get('new') === '1'
  const presetType = searchParams.get('type')
  const openSheet = () => setSearchParams({ new: '1' })
  const closeSheet = () => setSearchParams({}, { replace: true })

  const params = { type: type === 'ALL' ? undefined : type, start_date: range.start, end_date: range.end, page, page_size: pageSize }
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useMovements(params)

  const exportExcel = async () => {
    try {
      const { blob, filename } = await stockApi.export({ type: params.type, start_date: range.start, end_date: range.end })
      saveBlob(blob, filename)
      toast.success(`Export ready · ${filename}`, { description: `${type === 'ALL' ? 'All types' : `${type} only`} · ${formatRange(range)}` })
    } catch (e) {
      toast.error('Export failed', { description: e instanceof Error ? e.message : undefined })
    }
  }

  return (
    <Page>
      <PageHeader
        title="Stock movements"
        description="Every quantity change, newest first. Movements can’t be edited; record an adjustment to correct."
        actions={
          <>
            <Button variant="outline" onClick={exportExcel}>
              <DownloadIcon />
              Export
            </Button>
            <Button onClick={openSheet}>
              <PlusIcon />
              New movement
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker
          value={range}
          onChange={(next) => {
            setRange(next)
            setPage(1)
          }}
        />
        <FilterChips
          label="Movement type"
          value={type}
          onChange={(next) => {
            setType(next)
            setPage(1)
          }}
          options={TYPE_OPTIONS}
        />
        {data && <span className="ml-auto text-[13px] text-muted-foreground">{formatNumber(data.total)} movements</span>}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : !isPending && data.items.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRightIcon}
            title={`No ${type === 'ALL' ? '' : `${type} `}movements in this range`}
            description="Pick another type or widen the date range."
          />
        ) : (
          <>
            <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
              <MovementsTable movements={data?.items ?? []} loading={isPending} />
            </div>
            {data && (
              <Pagination
                page={data.page}
                pageSize={data.page_size}
                total={data.total}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPage(1)
                }}
              />
            )}
          </>
        )}
      </div>

      <NewMovementSheet
        open={sheetOpen}
        initialProductId={Number(searchParams.get('product')) || undefined}
        initialType={presetType === 'IN' || presetType === 'OUT' || presetType === 'ADJUSTMENT' ? presetType : undefined}
        onOpenChange={(open) => (open ? openSheet() : closeSheet())}
      />
    </Page>
  )
}
