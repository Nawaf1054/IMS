import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-muted text-subtle-foreground border-border',
  primary: 'bg-primary-soft text-primary-soft-foreground border-transparent',
  success: 'bg-success-soft text-success border-success-line',
  warning: 'bg-warning-soft text-warning border-warning-line',
  danger: 'bg-danger-soft text-danger border-danger-line',
  info: 'bg-info-soft text-info border-info-line',
}

interface StatusBadgeProps {
  tone: Tone
  children: ReactNode
  /** Leading status dot (stock states). */
  dot?: boolean
  icon?: ReactNode
  size?: 'sm' | 'default'
  className?: string
}

/** Rounded status chip: "Low stock", "Completed", "Cancelled"… */
export function StatusBadge({ tone, children, dot, icon, size = 'default', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'h-5 px-[7px] text-[11px]' : 'h-[22px] px-2 text-xs',
        TONES[tone],
        className,
      )}
    >
      {dot && <span aria-hidden="true" className={cn('size-1.5 rounded-full bg-current', tone === 'neutral' && 'opacity-40')} />}
      {icon}
      {children}
    </span>
  )
}
