/** Dashboard KPI cards (DSH-1): products, stock value, today's and this month's sales, low stock. */
import { TriangleAlertIcon } from 'lucide-react'

import { StatCard } from '@/components/common/StatCard'
import { useMoney } from '@/features/settings'
import { formatChange, formatNumber, formatShortDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { useKpis } from '../api/queries'

/** Green or red percentage change versus the previous figure (nothing if there was none). */
function Change({ current, previous }: { current: string; previous: string }) {
  const change = formatChange(Number(current), Number(previous))
  if (!change) return null
  return <span className={cn('font-medium', Number(current) >= Number(previous) ? 'text-success' : 'text-danger')}>{change}</span>
}

/** DSH-1: total products, stock value, today's and this month's sales, low stock. */
export function KpiGrid() {
  const { data: k, isPending } = useKpis()
  const money = useMoney()
  const today = new Date()
  const prevMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const prevMonthEnd = new Date(
    today.getFullYear(),
    today.getMonth() - 1,
    Math.min(today.getDate(), new Date(today.getFullYear(), today.getMonth(), 0).getDate()),
  )

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard
        loading={isPending}
        label="Total products"
        value={k && formatNumber(k.total_products)}
        detail={k && `${formatNumber(k.active_products)} active · ${formatNumber(k.inactive_products)} inactive`}
      />
      <StatCard loading={isPending} label="Stock value (cost)" value={k && money(k.stock_value)} detail={k && `Across ${formatNumber(k.stock_units)} units`} />
      <StatCard
        loading={isPending}
        label="Today’s sales"
        value={k && money(k.today_sales)}
        detail={
          k && (
            <>
              <Change current={k.today_sales} previous={k.yesterday_sales} /> vs yesterday · {formatNumber(k.today_invoices)} invoices
            </>
          )
        }
      />
      <StatCard
        loading={isPending}
        label="This month’s sales"
        value={k && money(k.month_sales)}
        detail={
          k && (
            <>
              <Change current={k.month_sales} previous={k.previous_month_sales} /> vs {formatShortDate(prevMonthStart)}–{prevMonthEnd.getDate()} ·{' '}
              {formatNumber(k.month_invoices)} invoices
            </>
          )
        }
      />
      <StatCard
        tone="warning"
        loading={isPending}
        label={
          <>
            <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
            Low stock
          </>
        }
        value={k && `${formatNumber(k.low_stock_count)} products`}
        detail={
          k &&
          (k.out_of_stock_count > 0 ? (
            <>
              <span className="font-medium text-danger">{k.out_of_stock_count}</span> out of stock
            </>
          ) : (
            'At or below minimum quantity'
          ))
        }
        footer={
          !!k?.low_stock_count && (
            <a href="#low-stock" className="text-xs font-medium text-warning hover:underline">
              Review list →
            </a>
          )
        }
      />
    </div>
  )
}
