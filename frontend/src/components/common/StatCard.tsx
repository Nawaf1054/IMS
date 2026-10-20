/** Figure card used for KPIs and summaries: label, big value, detail line, optional meter. */
import type { ReactNode } from 'react'

import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: ReactNode
  value: ReactNode
  detail?: ReactNode
  /** Warning cards (low stock) use the amber surface. */
  tone?: 'default' | 'warning'
  loading?: boolean
  /** Bar or gauge between the value and the detail line. */
  meter?: ReactNode
  footer?: ReactNode
  size?: 'default' | 'compact'
  className?: string
}

/** KPI card: label, large figure, supporting line. */
export function StatCard({ label, value, detail, tone = 'default', loading, meter, footer, size = 'default', className }: StatCardProps) {
  const warning = tone === 'warning'
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-lg border',
        size === 'compact' ? 'gap-0 px-4 py-3.5' : 'gap-1.5 p-4',
        warning ? 'border-warning-line bg-warning-soft' : 'bg-card',
        className,
      )}
    >
      <span
        className={cn(
          'flex items-center gap-1.5',
          size === 'compact' ? 'text-xs' : 'text-[13px]',
          warning ? 'font-medium text-warning' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      {loading ? (
        <Skeleton className="my-0.5 h-7 w-3/4" />
      ) : (
        <span className={cn('truncate font-semibold tracking-[-0.01em]', size === 'compact' ? 'text-xl leading-7' : 'text-[22px] leading-8')}>{value}</span>
      )}
      {meter}
      {detail && <span className={cn('text-xs', warning ? 'text-subtle-foreground' : 'text-muted-foreground')}>{detail}</span>}
      {footer}
    </div>
  )
}
