/** Placeholder for a feature that isn't released yet: a blurred, non-interactive preview with a "Coming soon" card on top. */
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface ComingSoonProps {
  /** The preview to blur. It can't be clicked, focused or read by screen readers. */
  children: ReactNode
  icon?: LucideIcon
  title?: string
  description?: ReactNode
  className?: string
}

/** Blurs `children` and lays a centered "Coming soon" notice over them. */
export function ComingSoon({ children, icon: Icon, title = 'Coming soon', description, className }: ComingSoonProps) {
  return (
    <div className={cn('relative', className)}>
      <div inert aria-hidden="true" className="pointer-events-none blur-[6px] select-none">
        {children}
      </div>
      <div className="absolute inset-0 flex items-start justify-center px-4 pt-16 md:pt-28">
        <div role="status" className="flex max-w-sm flex-col items-center gap-2 rounded-xl border bg-card px-7 py-6 text-center shadow-lg">
          {Icon && (
            <span className="mb-1 flex size-11 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
              <Icon className="size-5" strokeWidth={1.8} aria-hidden="true" />
            </span>
          )}
          <strong className="text-lg font-semibold">{title}</strong>
          {description && <span className="text-[13px] text-muted-foreground">{description}</span>}
        </div>
      </div>
    </div>
  )
}
