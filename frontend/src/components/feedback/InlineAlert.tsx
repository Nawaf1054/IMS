/** Inline message box for errors, warnings and notes inside a page or form. */
import { CircleAlertIcon, LockIcon, TriangleAlertIcon, XIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

type AlertTone = 'error' | 'warning' | 'muted'

const TONES: Record<AlertTone, { box: string; icon: typeof CircleAlertIcon }> = {
  error: { box: 'border border-danger-line bg-danger-soft text-danger', icon: CircleAlertIcon },
  warning: { box: 'border border-warning-line bg-warning-soft text-warning', icon: TriangleAlertIcon },
  muted: { box: 'bg-muted text-subtle-foreground', icon: LockIcon },
}

interface InlineAlertProps {
  tone: AlertTone
  title?: ReactNode
  children?: ReactNode
  onDismiss?: () => void
  className?: string
  role?: 'alert' | 'status'
  id?: string
}

/** Banner inside a page or form: errors, warnings and the "view only" notice. */
export function InlineAlert({ tone, title, children, onDismiss, className, role, id }: InlineAlertProps) {
  const { box, icon: Icon } = TONES[tone]
  return (
    <div
      id={id}
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cn('flex items-start gap-2.5 rounded-lg px-3.5 py-2.5 text-[13px]', box, className)}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {title && <strong className="font-semibold">{title}</strong>}
        {children && <div className={cn(title && 'text-subtle-foreground')}>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}
