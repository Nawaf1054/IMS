import { cn } from '@/lib/utils'

import type { SegmentOption } from './SegmentedControl'

interface FilterChipsProps<T extends string> {
  value: T
  onChange: (value: T) => void
  options: SegmentOption<T>[]
  label: string
  size?: 'sm' | 'default'
}

/** Pill filters; the active pill inverts (movement type filters). */
export function FilterChips<T extends string>({ value, onChange, options, label, size = 'default' }: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full border font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              selected ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-subtle-foreground hover:bg-muted',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
