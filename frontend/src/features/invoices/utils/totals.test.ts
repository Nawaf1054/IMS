import { computeTotals, lineTotal } from './totals'

describe('invoice totals', () => {
  it('multiplies quantity by the unit price in cents', () => {
    expect(lineTotal({ quantity: 40, unitPriceCents: 1900 })).toBe(76_000)
  })

  it('applies the discount before tax', () => {
    // Design example: subtotal 1,211.00, discount 11.00, VAT 15% → 1,380.00
    const totals = computeTotals(
      [
        { quantity: 40, unitPriceCents: 1900 },
        { quantity: 4, unitPriceCents: 5800 },
        { quantity: 6, unitPriceCents: 2900 },
        { quantity: 1, unitPriceCents: 4500 },
      ],
      1100,
      '0.15',
    )
    expect(totals).toEqual({ subtotal: 121_100, discount: 1100, taxable: 120_000, tax: 18_000, total: 138_000 })
  })

  it('rounds tax half-up to the cent', () => {
    expect(computeTotals([{ quantity: 1, unitPriceCents: 333 }], 0, '0.15').tax).toBe(50) // 49.95 → 50
  })

  it('never lets the discount exceed the subtotal or go negative', () => {
    expect(computeTotals([{ quantity: 1, unitPriceCents: 1000 }], 5000, '0').total).toBe(0)
    expect(computeTotals([{ quantity: 1, unitPriceCents: 1000 }], -500, '0').total).toBe(1000)
  })

  it('handles a zero tax rate', () => {
    expect(computeTotals([{ quantity: 3, unitPriceCents: 1999 }], 0, '0')).toMatchObject({ tax: 0, total: 5997 })
  })
})
