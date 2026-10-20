/** Labelled form field with help text and an accessible error message. */
import { type ReactNode, useId } from 'react'

import { cn } from '@/lib/utils'

interface FormFieldProps {
  label: ReactNode
  /** Secondary text next to the label, e.g. "Optional". */
  hint?: ReactNode
  help?: ReactNode
  error?: string | null
  className?: string
  /** Receives the ids to wire the control: `<Input id={id} aria-describedby={describedBy} aria-invalid={invalid} />`. */
  children: (field: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
  labelAction?: ReactNode
}

/** Label 13px/500 above the control, helper or error text 12px below. */
export function FormField({ label, hint, help, error, className, children, labelAction }: FormFieldProps) {
  const id = useId()
  const messageId = `${id}-message`
  const message = error || help
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-[13px] font-medium">
          {label}
          {hint && <span className="ml-1.5 font-normal text-muted-foreground">{hint}</span>}
        </label>
        {labelAction}
      </div>
      {children({ id, describedBy: message ? messageId : undefined, invalid: !!error })}
      {message && (
        <span id={messageId} className={cn('text-xs', error ? 'text-danger' : 'text-muted-foreground')}>
          {message}
        </span>
      )}
    </div>
  )
}
