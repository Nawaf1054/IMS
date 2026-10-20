/** Small step chart of a product's stock level over the last 30 days. */
import { Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'

import { Panel } from '@/components/common/Panel'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { addDays, toISODate } from '@/lib/dates'
import { formatDateTime, formatShortDate } from '@/lib/format'
import type { ProductDetail } from '@/types/models'

import { useProductMovements } from '../api/queries'

const DAYS = 30
/** Most movements one request returns (the API's page-size limit). */
const MAX_MOVEMENTS = 100

/** Step chart of quantity on hand over the last 30 days, with the minimum as a dashed line. */
export function StockLevelChart({ product }: { product: ProductDetail }) {
  const now = new Date()
  const windowStart = addDays(now, -(DAYS - 1))
  windowStart.setHours(0, 0, 0, 0)
  const { data, isPending } = useProductMovements(product.id, { start_date: toISODate(windowStart), page_size: MAX_MOVEMENTS })

  // Movements arrive newest first; the level before the oldest one is where the chart starts.
  const movements = [...(data?.items ?? [])].reverse()
  // A busy product can have more movements than one page holds. Then the chart starts at the oldest
  // loaded movement instead of claiming that level held since the start of the 30 days.
  const truncated = !!data && data.total > data.items.length && movements.length > 0
  const start = truncated ? new Date(movements[0].created_at) : windowStart
  const opening = movements.length ? movements[0].balance_after - movements[0].quantity : product.quantity
  const points = [
    { t: start.getTime(), qty: opening },
    ...movements.map((m) => ({ t: new Date(m.created_at).getTime(), qty: m.balance_after })),
    { t: now.getTime(), qty: product.quantity },
  ]
  const first = points[0].qty
  const description =
    first === product.quantity
      ? `Stock held at ${product.quantity} units over the last ${DAYS} days`
      : `Stock went from ${first} units on ${formatShortDate(start)} to ${product.quantity} today`

  return (
    <Panel className="flex flex-col gap-2.5 p-5">
      <h2 className="text-section-title">Stock level · {DAYS} days</h2>
      {isPending ? (
        <Skeleton className="h-[90px]" />
      ) : (
        <ChartContainer
          config={{ qty: { label: 'On hand', color: 'var(--chart-1)' } }}
          className="aspect-auto h-[90px] w-full"
          role="img"
          aria-label={description}
        >
          <LineChart data={points} margin={{ top: 6, right: 2, bottom: 0, left: 2 }}>
            <XAxis dataKey="t" type="number" domain={[start.getTime(), now.getTime()]} hide />
            <YAxis hide domain={[0, (max: number) => Math.max(max, product.min_quantity) * 1.1 || 1]} />
            <ReferenceLine y={product.min_quantity} stroke="var(--warning)" strokeDasharray="3 3" />
            <ChartTooltip
              cursor={{ stroke: 'var(--border-strong)' }}
              content={({ active, payload }) => {
                const point = active ? (payload?.[0]?.payload as (typeof points)[number] | undefined) : undefined
                if (!point) return null
                return (
                  <div className="rounded-lg border bg-card px-2.5 py-1.5 text-xs shadow-overlay">
                    <div className="text-muted-foreground">{formatDateTime(new Date(point.t).toISOString())}</div>
                    <div className="font-semibold">{point.qty} on hand</div>
                  </div>
                )
              }}
            />
            <Line dataKey="qty" type="stepAfter" stroke="var(--color-qty)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ChartContainer>
      )}
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>{formatShortDate(start)}</span>
        <span className="text-warning">min {product.min_quantity}</span>
        <span>{formatShortDate(now)}</span>
      </div>
    </Panel>
  )
}
