/** Placeholder for lists and panels with nothing to show. */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  /** Dashed outline when the empty state stands alone on the page. */
  bordered?: boolean
  className?: string
}

/** Icon, title, description and an optional action, centred. */
export function EmptyState({ icon: Icon, title, description, action, bordered, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-2 px-6 py-14 text-center',
        bordered && 'rounded-lg border border-dashed border-border-strong py-16',
        className,
      )}
    >
      {Icon && (
        <span className="mb-1 flex size-10 items-center justify-center rounded-[10px] bg-muted text-muted-foreground">
          <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
      )}
      <strong className="font-semibold">{title}</strong>
      {description && <span className="max-w-sm text-[13px] text-muted-foreground">{description}</span>}
      {action && <div className="mt-1.5">{action}</div>}
    </div>
  )
}
