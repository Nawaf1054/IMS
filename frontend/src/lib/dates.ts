/** Calendar helpers. Dates on the wire are ISO dates (YYYY-MM-DD) in local business time. */

export interface DateRange {
  start: string
  end: string
}

export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

/** Number of calendar days in an inclusive range. */
export function daysInRange(range: DateRange): number {
  const ms = parseISODate(range.end).getTime() - parseISODate(range.start).getTime()
  return Math.round(ms / 86_400_000) + 1
}

export type RangePresetId = '7D' | '30D' | '90D' | 'MTD'

export interface RangePreset {
  id: RangePresetId
  label: string
  range: (today: Date) => DateRange
}

export const RANGE_PRESETS: RangePreset[] = [
  { id: '7D', label: 'Last 7 days', range: (t) => ({ start: toISODate(addDays(t, -6)), end: toISODate(t) }) },
  { id: '30D', label: 'Last 30 days', range: (t) => ({ start: toISODate(addDays(t, -29)), end: toISODate(t) }) },
  { id: '90D', label: 'Last 90 days', range: (t) => ({ start: toISODate(addDays(t, -89)), end: toISODate(t) }) },
  {
    id: 'MTD',
    label: 'This month',
    range: (t) => ({ start: toISODate(new Date(t.getFullYear(), t.getMonth(), 1)), end: toISODate(t) }),
  },
]

export function presetRange(id: RangePresetId, today = new Date()): DateRange {
  const preset = RANGE_PRESETS.find((p) => p.id === id) ?? RANGE_PRESETS[1]
  return preset.range(today)
}
