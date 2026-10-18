import { useState } from 'react'
import { Link } from 'react-router'

import { Panel, PanelHeader } from '@/components/common/Panel'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { EmptyState } from '@/components/feedback/EmptyState'
import { QueryError } from '@/components/feedback/QueryError'
import { Skeleton } from '@/components/ui/skeleton'
import { useMoney } from '@/features/settings'
import type { DateRange } from '@/lib/dates'
import { formatNumber, formatRange } from '@/lib/format'

import { useTopProducts } from '../api/queries'

/** DSH-3: top 10 products by quantity or revenue. */
export function TopProductsCard({ range }: { range: DateRange }) {
  const [orderBy, setOrderBy] = useState<'quantity' | 'revenue'>('quantity')
  const money = useMoney()
  const { data, isPending, isError, error, refetch } = useTopProducts(range, orderBy)
  const value = (p: { quantity: number; revenue: string }) => (orderBy === 'quantity' ? p.quantity : Number(p.revenue))
  const max = data?.length ? Math.max(...data.map(value)) : 1

  return (
    <Panel aria-labelledby="top-heading" className="flex flex-col gap-4 p-5">
      <PanelHeader
        id="top-heading"
        title="Top 10 products"
        description={`By ${orderBy === 'quantity' ? 'quantity sold' : 'revenue'} · ${formatRange(range)}`}
        actions={
          <SegmentedControl
            label="Rank by"
            value={orderBy}
            onChange={setOrderBy}
            options={[
              { value: 'quantity', label: 'Quantity' },
              { value: 'revenue', label: 'Revenue' },
            ]}
          />
        }
      />
      {isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-[360px] rounded-md" />
      ) : !data.length ? (
        <EmptyState title="No sales in this range" description="Pick a wider date range." />
      ) : (
        <ol className="flex flex-col gap-2.5">
          {data.map((product, i) => (
            <li key={product.product_id} className="grid grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 text-[13px]">
              <span className="text-right text-muted-foreground">{i + 1}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <Link to={`/products/${product.product_id}`} className="truncate text-foreground hover:text-primary-soft-foreground">
                  {product.name}
                </Link>
                <span className="h-2 overflow-hidden rounded-[3px] bg-muted">
                  <span className="block h-full rounded-[3px] bg-chart-1" style={{ width: `${(value(product) / max) * 100}%` }} />
                </span>
              </span>
              <span className="min-w-[96px] text-right font-medium">
                {orderBy === 'quantity' ? `${formatNumber(product.quantity)} units` : money(product.revenue)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
