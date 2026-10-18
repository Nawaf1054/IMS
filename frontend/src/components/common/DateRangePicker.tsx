import { CalendarIcon, ChevronDownIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { type DateRange, RANGE_PRESETS } from '@/lib/dates'
import { formatRange, formatShortDate } from '@/lib/format'

interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

/** Calendar button → presets plus a custom From/To range. */
export function DateRangePicker({ value, onChange, className }: DateRangePickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange>(value)
  const today = new Date()
  const draftValid = draft.start && draft.end && draft.start <= draft.end

  const choose = (range: DateRange) => {
    onChange(range)
    setOpen(false)
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setDraft(value)
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={className}>
          <CalendarIcon className="text-muted-foreground" />
          {formatRange(value)}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[300px] gap-0.5 p-2">
        {RANGE_PRESETS.map((preset) => {
          const range = preset.range(today)
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => choose(range)}
              className="flex h-[34px] items-center justify-between rounded-md px-2.5 text-left hover:bg-muted"
            >
              <span>{preset.label}</span>
              <span className="text-xs text-muted-foreground">
                {formatShortDate(range.start)} – {formatShortDate(range.end)}
              </span>
            </button>
          )
        })}
        <div className="my-1.5 border-t" />
        <div className="grid grid-cols-2 gap-2 px-1.5 pt-1 pb-1.5">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <Input
              type="date"
              className="h-8 px-2 text-[13px]"
              value={draft.start}
              max={draft.end}
              onChange={(e) => setDraft({ ...draft, start: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <Input
              type="date"
              className="h-8 px-2 text-[13px]"
              value={draft.end}
              min={draft.start}
              onChange={(e) => setDraft({ ...draft, end: e.target.value })}
            />
          </label>
        </div>
        <Button size="sm" className="mx-1.5 mb-1" disabled={!draftValid} onClick={() => choose(draft)}>
          Apply custom range
        </Button>
      </PopoverContent>
    </Popover>
  )
}
