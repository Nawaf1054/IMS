/** Tests for the display formatters (money, quantities, rates, dates, initials). */
import { formatChange, formatMoney, formatMoneyCompact, formatRange, formatRelativeDateTime, formatSignedQuantity, formatTaxRate, initials } from './format'

describe('format', () => {
  it('puts the currency code first with two decimals', () => {
    expect(formatMoney('1380', 'SAR')).toBe('SAR 1,380.00')
    expect(formatMoney(-11, 'SAR')).toBe('− SAR 11.00')
  })

  it('compacts large amounts for chart axes', () => {
    expect(formatMoneyCompact(61_240.3, 'SAR')).toBe('SAR 61.2k')
    expect(formatMoneyCompact(186_420, 'SAR')).toBe('SAR 186k')
    expect(formatMoneyCompact(950, 'SAR')).toBe('SAR 950')
  })

  it('signs quantities with a true minus', () => {
    expect(formatSignedQuantity(12)).toBe('+12')
    expect(formatSignedQuantity(-3)).toBe('−3')
  })

  it('shows tax rates as percentages', () => {
    expect(formatTaxRate('0.15')).toBe('15%')
    expect(formatTaxRate('0.075')).toBe('7.5%')
    expect(formatTaxRate('0')).toBe('0%')
  })

  it('describes percentage change', () => {
    expect(formatChange(112.4, 100)).toBe('+12.4%')
    expect(formatChange(90, 100)).toBe('−10.0%')
    expect(formatChange(10, 0)).toBeNull()
  })

  it('labels same-day timestamps as today', () => {
    const now = new Date(2026, 9, 8, 12, 0)
    expect(formatRelativeDateTime(new Date(2026, 9, 8, 11, 8).toISOString(), now)).toBe('Today, 11:08')
    expect(formatRelativeDateTime(new Date(2026, 9, 7, 17, 50).toISOString(), now)).toBe('Oct 7, 17:50')
  })

  it('formats date ranges', () => {
    expect(formatRange({ start: '2026-09-09', end: '2026-10-08' })).toBe('Sep 9 – Oct 8, 2026')
    expect(formatRange({ start: '2025-12-20', end: '2026-01-05' })).toBe('Dec 20, 2025 – Jan 5, 2026')
  })

  it('builds initials from names', () => {
    expect(initials('Fahad Al-Harbi')).toBe('FA')
    expect(initials('noura')).toBe('N')
  })
})
