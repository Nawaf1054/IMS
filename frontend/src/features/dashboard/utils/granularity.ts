/** Rules for which chart granularities make sense for a date range. */
import { type DateRange, daysInRange } from '@/lib/dates'

import type { Granularity } from '../types'

/** Shortest range each granularity is useful for. */
export const GRANULARITY_MIN_DAYS: Record<Granularity, number> = { daily: 1, weekly: 14, monthly: 60 }

/** Picks the finest granularity still allowed when the range shrinks. */
export function fitGranularity(granularity: Granularity, range: DateRange): Granularity {
  const days = daysInRange(range)
  if (granularity === 'monthly' && days < GRANULARITY_MIN_DAYS.monthly) return 'weekly'
  if (granularity === 'weekly' && days < GRANULARITY_MIN_DAYS.weekly) return 'daily'
  return granularity
}
