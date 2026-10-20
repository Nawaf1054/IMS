/** Segmented button group for picking one option (e.g. daily / weekly / monthly). */
import { cn } from '@/lib/utils'

export interface SegmentOption<T extends string> {
  value: T
  label: string
  disabled?: boolean
}

interface SegmentedControlProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  label: string
  size?: 'sm' | 'default'
  className?: string
}

/** Muted track with a raised selected segment (Daily / Weekly / Monthly, 7D / 30D …). */
export function SegmentedControl<T extends string>({ value, onChange, options, label, size = 'default', className }: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className={cn('inline-flex gap-0.5 rounded-lg bg-muted p-[3px]', className)}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-md px-2.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
              size === 'sm' ? 'h-[26px]' : 'h-7',
              selected ? 'bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.08)]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
