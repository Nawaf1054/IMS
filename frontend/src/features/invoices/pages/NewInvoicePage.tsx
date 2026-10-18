import { CircleAlertIcon, MinusIcon, PlusIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'

import { FormField } from '@/components/common/FormField'
import { Panel } from '@/components/common/Panel'
import { EmptyState } from '@/components/feedback/EmptyState'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useIsAdmin } from '@/features/auth'
import { useMoney, useSettings } from '@/features/settings'
import { isApiError } from '@/lib/api-client'
import { formatTaxRate } from '@/lib/format'
import { fromCents, isMoneyInput, toCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/models'

import { useCreateInvoice, useNextInvoiceNumber } from '../api/queries'
import { ProductSuggestions } from '../components/ProductSuggestions'
import { computeTotals } from '../utils/totals'

interface Line {
  product: Product
  quantity: string
  unitPrice: string
}

function lineError(line: Line): string | null {
  const qty = Number(line.quantity)
  if (!/^\d+$/.test(line.quantity) || qty < 1) return 'Enter a quantity of at least 1.'
  if (qty > line.product.quantity) return `Insufficient stock: only ${line.product.quantity} available.`
  if (!isMoneyInput(line.unitPrice)) return 'Enter a unit price, e.g. 19.00.'
  return null
}

export function NewInvoicePage() {
  const navigate = useNavigate()
  const isAdmin = useIsAdmin()
  const money = useMoney()
  const { data: settings } = useSettings()
  const { data: nextNumber } = useNextInvoiceNumber()
  const create = useCreateInvoice()
  const [lines, setLines] = useState<Line[]>([])
  const [customer, setCustomer] = useState('')
  const [discount, setDiscount] = useState('0.00')

  const taxRate = settings?.tax_rate ?? '0'
  const update = (id: number, patch: Partial<Line>) => setLines((all) => all.map((l) => (l.product.id === id ? { ...l, ...patch } : l)))
  const add = (product: Product) =>
    setLines((all) =>
      all.some((l) => l.product.id === product.id)
        ? all.map((l) => (l.product.id === product.id ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l))
        : [...all, { product, quantity: '1', unitPrice: product.sell_price }],
    )

  const errors = lines.map(lineError)
  const errorCount = errors.filter(Boolean).length
  const discountValid = isMoneyInput(discount || '0')
  const totals = computeTotals(
    lines.map((l, i) => ({ quantity: errors[i] ? 0 : Number(l.quantity), unitPriceCents: errors[i] ? 0 : toCents(l.unitPrice) })),
    discountValid ? toCents(discount || '0') : 0,
    taxRate,
  )
  const discountError = !discountValid
    ? 'Enter the discount as an amount, e.g. 50.00.'
    : toCents(discount || '0') > totals.subtotal && lines.length
      ? 'Discount can’t exceed the subtotal.'
      : null
  const blocker = !lines.length
    ? null
    : errorCount
      ? `Fix ${errorCount} ${errorCount === 1 ? 'line' : 'lines'} before saving. Stock can’t go below zero.`
      : discountError
        ? 'Check the discount.'
        : null
  const canSave = lines.length > 0 && !blocker && !create.isPending

  const save = () => {
    if (!canSave) return
    create.mutate(
      {
        customer_name: customer.trim() || null,
        discount: fromCents(toCents(discount || '0')),
        items: lines.map((l) => ({
          product_id: l.product.id,
          quantity: Number(l.quantity),
          // INV-5: the server stores the product's current price; admins may override it.
          ...(isAdmin && toCents(l.unitPrice) !== toCents(l.product.sell_price) && { unit_price: fromCents(toCents(l.unitPrice)) }),
        })),
      },
      {
        onSuccess: (invoice) => {
          toast.success(`Invoice ${invoice.invoice_number} saved`, { description: 'Stock updated · ready to print' })
          navigate(`/invoices/${invoice.id}`)
        },
        onError: (e) =>
          toast.error(isApiError(e, 'INSUFFICIENT_STOCK') ? 'Stock changed while you were working' : 'Couldn’t save invoice', { description: e.message }),
      },
    )
  }

  return (
    <Page className="md:pt-5">
      <PageHeader
        breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: 'New' }]}
        title="New invoice"
        actions={
          nextNumber && (
            <span className="self-center text-[13px] text-muted-foreground">
              Next number <span className="font-mono text-subtle-foreground">{nextNumber}</span> · assigned on save
            </span>
          )
        }
      />

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <ProductSuggestions onAdd={add} />

          <Panel aria-labelledby="items-heading">
            <div className="flex items-center justify-between border-b px-4 py-3.5">
              <h2 id="items-heading" className="text-section-title">
                Items <span className="font-normal text-muted-foreground">({lines.length})</span>
              </h2>
              {lines.length > 0 && (
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setLines([])}>
                  Clear all
                </Button>
              )}
            </div>
            {lines.length === 0 ? (
              <EmptyState title="No items yet" description="Search above or tap a product to add it to this invoice." className="py-12" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th scope="col" className="h-[34px] border-b px-4 text-left font-medium">
                        Product
                      </th>
                      <th scope="col" className="w-[140px] border-b px-2 text-center font-medium">
                        Qty
                      </th>
                      <th scope="col" className="w-[140px] border-b px-2 text-right font-medium">
                        Unit price
                      </th>
                      <th scope="col" className="w-[130px] border-b px-4 text-right font-medium">
                        Line total
                      </th>
                      <th scope="col" className="w-11 border-b">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, i) => {
                      const error = errors[i]
                      const { product } = line
                      return (
                        <tr key={product.id} className={cn(error && 'bg-danger-soft')}>
                          <td className="border-b px-4 py-2.5 align-top">
                            <div className="font-medium">{product.name}</div>
                            <div className="text-xs text-muted-foreground">
                              <span className="font-mono">{product.sku}</span> · {product.quantity} in stock
                            </div>
                            {error && (
                              <div role="alert" className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-medium text-danger">
                                <CircleAlertIcon className="size-[13px]" aria-hidden="true" />
                                {error}
                                {Number(line.quantity) > product.quantity && product.quantity > 0 && (
                                  <button
                                    type="button"
                                    className="text-primary-soft-foreground underline"
                                    onClick={() => update(product.id, { quantity: String(product.quantity) })}
                                  >
                                    Set to {product.quantity}
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="border-b px-2 py-2.5 align-top">
                            <div
                              className={cn(
                                'flex h-9 items-center overflow-hidden rounded-lg border bg-card',
                                error && Number(line.quantity) > 0 && 'border-danger',
                              )}
                            >
                              <button
                                type="button"
                                aria-label={`Decrease quantity of ${product.name}`}
                                className="flex h-full w-[34px] items-center justify-center text-subtle-foreground hover:bg-muted"
                                onClick={() => update(product.id, { quantity: String(Math.max(1, (Number(line.quantity) || 1) - 1)) })}
                              >
                                <MinusIcon className="size-3.5" />
                              </button>
                              <label className="flex min-w-0 flex-1">
                                <span className="sr-only">Quantity of {product.name}</span>
                                <input
                                  inputMode="numeric"
                                  value={line.quantity}
                                  aria-invalid={!!error}
                                  onChange={(e) => update(product.id, { quantity: e.target.value.replace(/[^0-9]/g, '') })}
                                  className={cn('h-[34px] w-full min-w-0 bg-transparent text-center font-semibold outline-none', error && 'text-danger')}
                                />
                              </label>
                              <button
                                type="button"
                                aria-label={`Increase quantity of ${product.name}`}
                                className="flex h-full w-[34px] items-center justify-center text-subtle-foreground hover:bg-muted"
                                onClick={() => update(product.id, { quantity: String((Number(line.quantity) || 0) + 1) })}
                              >
                                <PlusIcon className="size-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="border-b px-2 py-2.5 align-top">
                            <label className="flex">
                              <span className="sr-only">Unit price of {product.name}</span>
                              <Input
                                inputMode="decimal"
                                value={line.unitPrice}
                                readOnly={!isAdmin}
                                title={isAdmin ? 'Override the unit price for this invoice' : 'Only admins can change prices'}
                                onChange={(e) => update(product.id, { unitPrice: e.target.value })}
                                className="text-right"
                              />
                            </label>
                          </td>
                          <td className="border-b px-4 pt-[18px] pb-2.5 text-right align-top font-semibold whitespace-nowrap">
                            {error ? '—' : money(fromCents(Number(line.quantity) * toCents(line.unitPrice)))}
                          </td>
                          <td className="border-b py-2.5 pr-2 align-top">
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-muted-foreground"
                              aria-label={`Remove ${product.name}`}
                              onClick={() => setLines((all) => all.filter((l) => l.product.id !== product.id))}
                            >
                              <XIcon />
                            </Button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {!isAdmin && lines.length > 0 && (
              <p className="px-4 py-2.5 text-xs text-muted-foreground">Unit prices come from the product. Only admins can override them.</p>
            )}
          </Panel>
        </div>

        <aside aria-labelledby="summary-heading" className="flex min-w-0 flex-col rounded-lg border bg-card xl:sticky xl:top-[72px]">
          <div className="flex flex-col gap-3.5 border-b px-5 py-[18px]">
            <h2 id="summary-heading" className="text-section-title">
              Summary
            </h2>
            <FormField label="Customer name" hint="Optional, leave blank for walk-in">
              {(f) => <Input id={f.id} className="h-[38px]" placeholder="Walk-in customer" value={customer} onChange={(e) => setCustomer(e.target.value)} />}
            </FormField>
          </div>
          <dl className="flex flex-col gap-2.5 px-5 py-4">
            <div className="flex justify-between">
              <dt className="text-subtle-foreground">Subtotal</dt>
              <dd>{money(fromCents(totals.subtotal))}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>
                <label htmlFor="discount" className="text-subtle-foreground">
                  Discount
                </label>
              </dt>
              <dd className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{settings?.currency}</span>
                <Input
                  id="discount"
                  inputMode="decimal"
                  className="h-8 w-[110px] text-right"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  aria-invalid={!!discountError}
                />
              </dd>
            </div>
            {discountError && <span className="text-right text-xs text-danger">{discountError}</span>}
            <div className="flex justify-between">
              <dt className="text-subtle-foreground">VAT {formatTaxRate(taxRate)}</dt>
              <dd>{money(fromCents(totals.tax))}</dd>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between border-t pt-3">
              <dt className="font-semibold">Total</dt>
              <dd className="text-[26px] leading-8 font-semibold tracking-[-0.01em]">{money(fromCents(totals.total))}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-2.5 px-5 pb-5">
            {blocker && (
              <div role="alert" className="rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
                {blocker}
              </div>
            )}
            <Button size="lg" className="h-[52px] rounded-[10px] text-base" disabled={!canSave} onClick={save}>
              {create.isPending ? 'Saving…' : `Save invoice · ${money(fromCents(totals.total))}`}
            </Button>
            <span className="text-center text-xs text-muted-foreground">
              Saving creates SALE movements and reduces stock in one step. Invoices can’t be edited afterwards.
            </span>
          </div>
        </aside>
      </div>
    </Page>
  )
}
