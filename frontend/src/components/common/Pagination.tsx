/** List pager: "1–20 of 135", page buttons and the page-size selector. */
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { PAGE_SIZE_OPTIONS } from '@/config/constants'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  /** Overrides the "Showing 1–20 of 248" summary. */
  summary?: ReactNode
}

/** Page numbers around the current page, with gaps: 1 2 3 … 13 */
function pageList(page: number, pages: number): Array<number | 'gap'> {
  const wanted = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages))
  if (page <= 3) [2, 3].forEach((p) => p <= pages && wanted.add(p))
  const sorted = [...wanted].sort((a, b) => a - b)
  return sorted.flatMap((p, i) => (i > 0 && p - sorted[i - 1] > 1 ? (['gap', p] as const) : [p]))
}

const pageButton =
  'inline-flex size-8 min-w-8 items-center justify-center rounded-lg border bg-card text-[13px] disabled:cursor-not-allowed disabled:opacity-50'

/** Pager for a list of `total` rows shown `pageSize` at a time. */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, summary }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-[13px] text-muted-foreground">
      <span>{summary ?? `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(total)}`}</span>
      <div className="flex items-center gap-1.5">
        {onPageSizeChange && (
          <label className="mr-2 hidden items-center gap-1.5 md:flex">
            Rows
            <NativeSelect size="sm" value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} aria-label="Rows per page">
              {PAGE_SIZE_OPTIONS.map((size) => (
                <NativeSelectOption key={size} value={size}>
                  {size}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </label>
        )}
        <button
          type="button"
          className={cn(pageButton, 'text-subtle-foreground')}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeftIcon className="size-3.5" />
        </button>
        {pageList(page, pages).map((p, i) =>
          p === 'gap' ? (
            <span key={`gap-${i}`} aria-hidden="true" className="hidden px-0.5 md:inline">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
              className={cn(
                pageButton,
                'w-auto px-2',
                p === page
                  ? 'border-primary bg-primary-soft font-semibold text-primary-soft-foreground'
                  : 'hidden text-foreground hover:bg-muted md:inline-flex',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          className={cn(pageButton, 'text-subtle-foreground')}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRightIcon className="size-3.5" />
        </button>
      </div>
    </nav>
  )
}
