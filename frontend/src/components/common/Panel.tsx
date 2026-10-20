/** Card container used for page sections, with an optional title row. */
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** The bordered surface every section sits on (radius 8, 1px border, no shadow). */
export function Panel({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('min-w-0 rounded-lg border bg-card', className)} {...props} />
}

interface PanelHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  id?: string
  className?: string
}

/** A panel's title, optional description and actions on the right. */
export function PanelHeader({ title, description, actions, id, className }: PanelHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-section-title flex items-center gap-2">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  )
}
