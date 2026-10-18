/**
 * Money arithmetic in integer cents (PRD §7: never floats). Values arrive from the
 * API as decimal strings and go back the same way; all math happens on integers.
 */
import type { Money } from '@/types/api'

const MONEY_INPUT = /^\d*(?:\.\d*)?$/

/** Accepts what a user may type into a price field ("12", "12.5", ".5"). */
export function isMoneyInput(value: string): boolean {
  return value.trim() !== '' && MONEY_INPUT.test(value.trim()) && value.trim() !== '.'
}

/** "12.345" → 1235 (half-up on the third decimal). */
export function toCents(value: Money | number): number {
  if (typeof value === 'number') return Math.round(value * 100)
  const trimmed = value.trim()
  const negative = trimmed.startsWith('-')
  const [whole = '0', fraction = ''] = trimmed.replace(/^[-+]/, '').split('.')
  const padded = (fraction + '000').slice(0, 3)
  let cents = Number(whole || '0') * 100 + Number(padded.slice(0, 2))
  if (Number(padded[2]) >= 5) cents += 1
  return negative ? -cents : cents
}

/** 1235 → "12.35" */
export function fromCents(cents: number): Money {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** Applies a fractional rate ("0.15") to an amount in cents, rounding half-up. */
export function applyRate(cents: number, rate: string): number {
  const basisPoints = Math.round(Number(rate) * 10_000)
  return Math.round((cents * basisPoints) / 10_000)
}
