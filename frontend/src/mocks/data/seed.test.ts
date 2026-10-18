import { createSeed } from './seed'

/**
 * The mock data must obey the same stock rules as the real system, otherwise the
 * UI would be developed against impossible states.
 */
describe('mock seed data', () => {
  const seed = createSeed(new Date(2026, 9, 8, 12, 0))

  it('never lets a balance go below zero (STK-4)', () => {
    expect(seed.movements.every((m) => m.balance_after >= 0)).toBe(true)
  })

  it('keeps every balance consistent with the movements before it', () => {
    for (const product of seed.products) {
      const history = seed.movements.filter((m) => m.product_id === product.id)
      let running = 0
      for (const movement of history) {
        running += movement.quantity
        expect(movement.balance_after).toBe(running)
      }
      expect(running).toBe(product.quantity)
    }
  })

  it('ends at the quantities shown in the design', () => {
    const quantity = (sku: string) => seed.products.find((p) => p.sku === sku)?.quantity
    expect(quantity('TL-PWR-D18')).toBe(4)
    expect(quantity('TL-HND-WS440')).toBe(0)
    expect(quantity('BM-CEM-050')).toBe(420)
  })

  it('records one SALE movement per invoice line, and a reversal per line of cancelled invoices', () => {
    for (const invoice of seed.invoices.slice(0, 200)) {
      const movements = seed.movements.filter((m) => m.invoice_id === invoice.id)
      const sales = movements.filter((m) => m.type === 'SALE')
      const reversals = movements.filter((m) => m.type === 'IN')
      expect(sales).toHaveLength(invoice.items.length)
      expect(reversals).toHaveLength(invoice.status === 'CANCELLED' ? invoice.items.length : 0)
    }
  })

  it('numbers invoices sequentially (INV-3)', () => {
    const numbers = seed.invoices.map((i) => i.invoice_number)
    expect(new Set(numbers).size).toBe(numbers.length)
    expect(numbers[0]).toMatch(/^INV-\d{4}-00001$/)
  })
})
