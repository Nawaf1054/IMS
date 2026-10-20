/** Meter showing how many AI requests the user has left this hour (AI-8). */
import { ClockIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

import { useAiQuota } from '../api/queries'

/** "14:05" from an ISO timestamp. */
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

/** AI-8: requests left in the rolling hour; turns amber when three or fewer remain. */
export function QuotaMeter() {
  const { data: quota } = useAiQuota()
  if (!quota) return null
  const low = quota.remaining <= 3
  return (
    <div
      aria-label={`${quota.remaining} AI requests left this hour`}
      className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2', low ? 'border-warning-line bg-warning-soft' : 'bg-card')}
    >
      <ClockIcon className={cn('size-[15px]', low ? 'text-warning' : 'text-primary')} aria-hidden="true" />
      <div className="flex min-w-[150px] flex-col gap-1">
        <span className="text-xs text-subtle-foreground">
          <strong className={cn('font-semibold', low ? 'text-warning' : 'text-primary')}>{quota.remaining}</strong> of {quota.limit} requests left · resets{' '}
          {time(quota.resets_at)}
        </span>
        <span className="h-1 overflow-hidden rounded-sm bg-muted">
          <span className={cn('block h-full', low ? 'bg-warning' : 'bg-primary')} style={{ width: `${(quota.remaining / quota.limit) * 100}%` }} />
        </span>
      </div>
    </div>
  )
}
