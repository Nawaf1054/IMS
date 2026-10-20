/** Tests for integer-cent money arithmetic and money input validation. */
import { applyRate, fromCents, isMoneyInput, toCents } from './money'

describe('money', () => {
  it('parses decimal strings into cents without floating-point error', () => {
    expect(toCents('19.00')).toBe(1900)
    expect(toCents('0.1')).toBe(10)
    expect(toCents('46.5')).toBe(4650)
    expect(toCents('1234.565')).toBe(123_457)
    expect(toCents('-11.00')).toBe(-1100)
  })

  it('formats cents back into API decimal strings', () => {
    expect(fromCents(138_000)).toBe('1380.00')
    expect(fromCents(5)).toBe('0.05')
    expect(fromCents(-1100)).toBe('-11.00')
  })

  it('applies a fractional rate with half-up rounding', () => {
    expect(applyRate(120_000, '0.15')).toBe(18_000)
    expect(applyRate(333, '0.15')).toBe(50)
    expect(applyRate(999, '0')).toBe(0)
  })

  it('accepts only plain amounts as input', () => {
    expect(isMoneyInput('12')).toBe(true)
    expect(isMoneyInput('12.5')).toBe(true)
    expect(isMoneyInput('.')).toBe(false)
    expect(isMoneyInput('')).toBe(false)
    expect(isMoneyInput('1,200')).toBe(false)
    expect(isMoneyInput('-3')).toBe(false)
  })
})
