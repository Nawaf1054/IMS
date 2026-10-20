/** Dashboard donut chart and legend of revenue by category (DSH-4). */
import { Cell, Pie, PieChart } from 'recharts'

import { Panel, PanelHeader } from '@/components/common/Panel'
import { EmptyState } from '@/components/feedback/EmptyState'
import { QueryError } from '@/components/feedback/QueryError'
import { ChartContainer } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrency } from '@/features/settings'
import type { DateRange } from '@/lib/dates'
import { formatMoney, formatMoneyCompact, formatRange } from '@/lib/format'

import { useCategoryRevenue } from '../api/queries'

/** Six-step categorical ramp, in order; anything past six shares the last (grey) step. */
const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)']

/** DSH-4: revenue share by top-level category. */
export function CategoryRevenueCard({ range }: { range: DateRange }) {
  const currency = useCurrency()
  const { data, isPending, isError, error, refetch } = useCategoryRevenue(range)
  const total = data?.reduce((sum, c) => sum + Number(c.revenue), 0) ?? 0

  return (
    <Panel aria-labelledby="category-heading" className="flex flex-col gap-4 p-5">
      <PanelHeader id="category-heading" title="Revenue by category" description={formatRange(range)} />
      {isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-[300px] rounded-md" />
      ) : !data.length ? (
        <EmptyState title="No sales in this range" description="Pick a wider date range." />
      ) : (
        <>
          <div className="relative flex justify-center">
            <ChartContainer config={{}} className="aspect-square h-[168px]">
              <PieChart accessibilityLayer>
                <Pie
                  data={data.map((c) => ({ name: c.name, value: Number(c.revenue) }))}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={62}
                  outerRadius={80}
                  paddingAngle={1.5}
                  strokeWidth={0}
                  isAnimationActive={false}
                >
                  {data.map((c, i) => (
                    <Cell key={c.category_id} fill={SERIES[Math.min(i, SERIES.length - 1)]} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] text-muted-foreground">Total</span>
              <span className="text-base font-semibold">{formatMoneyCompact(total, currency)}</span>
            </div>
          </div>
          <ul className="flex flex-col">
            {data.map((c, i) => (
              <li key={c.category_id} className="flex items-center gap-2.5 border-t py-[7px] text-[13px]">
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES[Math.min(i, SERIES.length - 1)] }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="w-10 text-right text-muted-foreground">{Math.round(c.share * 100)}%</span>
                <span className="min-w-[104px] text-right font-medium">{formatMoney(c.revenue, currency)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Panel>
  )
}
