/** Dashboard revenue line chart (DSH-2) with the previous period for comparison. */
import { Area, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'

import { Panel, PanelHeader } from '@/components/common/Panel'
import { SegmentedControl } from '@/components/common/SegmentedControl'
import { QueryError } from '@/components/feedback/QueryError'
import { type ChartConfig, ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { useCurrency } from '@/features/settings'
import { type DateRange, daysInRange, parseISODate } from '@/lib/dates'
import { formatChange, formatMoney, formatMoneyCompact, formatNumber, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useSalesOverTime } from '../api/queries'
import type { Granularity, SalesPoint } from '../types'
import { GRANULARITY_MIN_DAYS } from '../utils/granularity'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const config = {
  revenue: { label: 'This period', color: 'var(--chart-1)' },
  previous: { label: 'Previous period', color: 'var(--chart-6)' },
} satisfies ChartConfig

/** X-axis / tooltip label for a point: a day, a week span or a month. */
function pointLabel(point: SalesPoint, granularity: Granularity): string {
  const start = parseISODate(point.period_start)
  if (granularity === 'daily') return formatShortDate(start)
  if (granularity === 'monthly') return `${MONTHS[start.getMonth()]} ${start.getFullYear()}`
  const end = parseISODate(point.period_end)
  return start.getMonth() === end.getMonth() ? `${formatShortDate(start)}–${end.getDate()}` : `${formatShortDate(start)} – ${formatShortDate(end)}`
}

interface RevenueChartProps {
  range: DateRange
  granularity: Granularity
  onGranularityChange: (granularity: Granularity) => void
}

/** DSH-2: revenue over time, current period vs the one before it. */
export function RevenueChart({ range, granularity, onGranularityChange }: RevenueChartProps) {
  const currency = useCurrency()
  const { data, isPending, isError, error, refetch, isFetching } = useSalesOverTime(range, granularity)
  const days = daysInRange(range)
  const rows =
    data?.points.map((point, i) => ({
      label: pointLabel(point, granularity),
      revenue: Number(point.revenue),
      previous: data.previous_points[i] ? Number(data.previous_points[i].revenue) : undefined,
      invoices: point.invoice_count,
    })) ?? []
  const change = data ? formatChange(Number(data.total), Number(data.previous_total)) : null
  const up = data ? Number(data.total) >= Number(data.previous_total) : true

  return (
    <Panel aria-labelledby="revenue-heading" className="flex flex-col gap-4 p-5">
      <PanelHeader
        id="revenue-heading"
        title="Revenue"
        description={
          data && (
            <span className="mt-1 flex flex-wrap items-baseline gap-2">
              <span className="text-2xl leading-8 font-semibold tracking-[-0.01em] text-foreground">{formatMoney(data.total, currency)}</span>
              {change && <span className={cn('text-xs font-medium', up ? 'text-success' : 'text-danger')}>{change}</span>}
              <span className="text-xs">vs previous {days} days</span>
            </span>
          )
        }
        actions={
          <SegmentedControl
            label="Granularity"
            value={granularity}
            onChange={onGranularityChange}
            options={(['daily', 'weekly', 'monthly'] as const).map((g) => ({
              value: g,
              label: g[0].toUpperCase() + g.slice(1),
              disabled: days < GRANULARITY_MIN_DAYS[g],
            }))}
          />
        }
      />

      {isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-[262px] rounded-md" />
      ) : (
        <>
          <ChartContainer config={config} className={cn('aspect-auto h-[240px] w-full transition-opacity', isFetching && 'opacity-60')}>
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} accessibilityLayer>
              <CartesianGrid vertical={false} strokeDasharray="3 4" stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} tickMargin={8} minTickGap={24} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} width={64} tickCount={4} fontSize={11} tickFormatter={(v: number) => formatMoneyCompact(v, currency)} />
              <ChartTooltip
                cursor={{ stroke: 'var(--border-strong)' }}
                content={({ active, payload }) => {
                  const row = active ? (payload?.[0]?.payload as (typeof rows)[number] | undefined) : undefined
                  if (!row) return null
                  return (
                    <div className="flex flex-col gap-0.5 rounded-lg border bg-card px-2.5 py-2 shadow-overlay">
                      <span className="text-xs text-muted-foreground">{row.label}</span>
                      <span className="text-sm font-semibold">{formatMoney(row.revenue, currency)}</span>
                      <span className="text-xs text-muted-foreground">{formatNumber(row.invoices)} invoices</span>
                    </div>
                  )
                }}
              />
              <Area
                dataKey="revenue"
                type="linear"
                stroke="var(--color-revenue)"
                strokeWidth={2}
                fill="var(--color-revenue)"
                fillOpacity={0.09}
                activeDot={{ r: 5, fill: 'var(--card)', strokeWidth: 2 }}
              />
              <Line dataKey="previous" type="linear" stroke="var(--color-previous)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} />
            </ComposedChart>
          </ChartContainer>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3.5 bg-chart-1" aria-hidden="true" />
              This period
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-3.5 border-t-2 border-dashed border-chart-6" aria-hidden="true" />
              Previous period
            </span>
          </div>
        </>
      )}
    </Panel>
  )
}
