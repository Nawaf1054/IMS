/**
 * Display formatting. Amounts: currency code first, two decimals, tabular figures
 * (design system "Figures & codes"). Dates: English, business-local time.
 */
import type { Money } from '@/types/api'

import { type DateRange, parseISODate } from './dates'

const LOCALE = 'en-US'
const MINUS = '−'

const decimal2 = new Intl.NumberFormat(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const integer = new Intl.NumberFormat(LOCALE)

/** "SAR 1,380.00"; negative amounts get a leading true minus. */
export function formatMoney(value: Money | number, currency: string): string {
  const n = Number(value)
  return `${n < 0 ? `${MINUS} ` : ''}${currency} ${decimal2.format(Math.abs(n))}`
}

/** "SAR 61.2k" for chart axes and compact totals. */
export function formatMoneyCompact(value: Money | number, currency: string): string {
  const n = Number(value)
  if (Math.abs(n) < 1000) return `${currency} ${Math.round(n)}`
  const k = n / 1000
  const digits = Math.abs(k) >= 100 ? 0 : 1
  return `${currency} ${k.toFixed(digits).replace(/\.0$/, '')}k`
}

/** Whole number with thousands separators. */
export function formatNumber(value: number): string {
  return integer.format(value)
}

/** "+12" / "−3" with a true minus sign. */
export function formatSignedQuantity(value: number): string {
  return `${value > 0 ? '+' : value < 0 ? MINUS : ''}${integer.format(Math.abs(value))}`
}

/** 0.311 → "31.1%" */
export function formatPercent(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`
}

/** "0.15" → "15%", "0.075" → "7.5%" */
export function formatTaxRate(rate: string): string {
  return `${Number((Number(rate) * 100).toFixed(2))}%`
}

/** Signed percentage change, e.g. "+12.4%". */
export function formatChange(current: number, previous: number): string | null {
  if (!previous) return null
  const change = ((current - previous) / previous) * 100
  return `${change >= 0 ? '+' : MINUS}${Math.abs(change).toFixed(1)}%`
}

// ── Dates ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** Two-digit zero padding, e.g. 7 → "07". */
const pad = (n: number) => String(n).padStart(2, '0')
/** "HH:MM" in 24-hour local time. */
const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Whether two dates fall on the same calendar day. */
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "3 Feb 2026" */
export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

/** "Thursday, 8 October 2026" */
export function formatLongDate(date: Date): string {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS_LONG[date.getMonth()]} ${date.getFullYear()}`
}

/** "08 Oct 2026, 11:08" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${time(d)}`
}

/** "08 October 2026, 11:08" for documents. */
export function formatDocumentDateTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getDate())} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}, ${time(d)}`
}

/** "Today, 11:08" · "Oct 7, 17:50" · "Dec 30 2025, 09:12" */
export function formatRelativeDateTime(iso: string, now = new Date()): string {
  const d = new Date(iso)
  if (sameDay(d, now)) return `Today, ${time(d)}`
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year}, ${time(d)}`
}

/** "Oct 8" */
export function formatShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? parseISODate(date) : date
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

/** "Sep 9 – Oct 8, 2026" */
export function formatRange(range: DateRange): string {
  const start = parseISODate(range.start)
  const end = parseISODate(range.end)
  const startYear = start.getFullYear() === end.getFullYear() ? '' : `, ${start.getFullYear()}`
  return `${formatShortDate(start)}${startYear} – ${formatShortDate(end)}, ${end.getFullYear()}`
}

/** Up to two initials from a name, e.g. "Fahad Al-Harbi" → "FA". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
