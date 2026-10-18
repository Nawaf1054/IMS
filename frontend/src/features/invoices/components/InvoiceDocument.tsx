import { formatDocumentDateTime, formatMoney, formatTaxRate } from '@/lib/format'
import { fromCents, toCents } from '@/lib/money'
import type { BusinessSettings, Invoice } from '@/types/models'

const label = 'text-xs font-semibold tracking-[0.08em] text-[#555555]'
const th = 'border-b-[1.5px] border-[#111111] pb-2 text-xs font-semibold tracking-[0.06em] text-[#333333]'
const td = 'border-b border-[#bbbbbb] py-3 align-top'

/**
 * The printed tax invoice (INV-8): an A4 sheet in fixed black-on-white so it
 * prints the same in light and dark mode. The server PDF uses the same layout.
 */
export function InvoiceDocument({ invoice, settings }: { invoice: Invoice; settings: BusinessSettings }) {
  const money = (value: string) => formatMoney(value, settings.currency)
  const rate = formatTaxRate(invoice.tax_rate)
  const taxable = fromCents(toCents(invoice.subtotal) - toCents(invoice.discount))

  return (
    <article className="print-sheet relative mx-auto flex min-h-[1123px] w-[794px] flex-col gap-8 bg-white px-16 pt-16 pb-14 font-sans text-base leading-6 text-[#111111] shadow-overlay">
      {invoice.status === 'CANCELLED' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[420px] left-1/2 -translate-x-1/2 -rotate-[24deg] rounded-xl border-[6px] border-[#b91c1c]/35 px-8 py-2 text-[88px] leading-none font-bold tracking-[0.08em] text-[#b91c1c]/35"
        >
          CANCELLED
        </span>
      )}
      <header className="flex items-start justify-between gap-6 border-b-2 border-[#111111] pb-6">
        <div className="flex max-w-[360px] flex-col gap-1">
          <div className="text-2xl leading-[30px] font-bold tracking-[-0.01em]">{settings.business_name}</div>
          <div className="text-sm leading-5 whitespace-pre-line text-[#444444]">{settings.business_address}</div>
        </div>
        <div className="flex flex-col gap-0.5 text-right">
          <div className="text-[13px] font-semibold tracking-[0.12em] text-[#444444]">TAX INVOICE</div>
          <div className="font-mono text-xl leading-7 font-medium">{invoice.invoice_number}</div>
        </div>
      </header>

      <section className="grid grid-cols-3 gap-6">
        <div>
          <div className={label}>BILL TO</div>
          <div className="font-semibold">{invoice.customer_name ?? 'Walk-in customer'}</div>
        </div>
        <div>
          <div className={label}>INVOICE DATE</div>
          <div>{formatDocumentDateTime(invoice.created_at)}</div>
        </div>
        <div>
          <div className={label}>SERVED BY</div>
          <div>{invoice.user_name}</div>
        </div>
      </section>

      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr>
            <th scope="col" className={`${th} w-8 text-left`}>
              #
            </th>
            <th scope="col" className={`${th} text-left`}>
              ITEM
            </th>
            <th scope="col" className={`${th} w-16 text-right`}>
              QTY
            </th>
            <th scope="col" className={`${th} w-[130px] text-right`}>
              UNIT PRICE
            </th>
            <th scope="col" className={`${th} w-[140px] text-right`}>
              AMOUNT
            </th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, i) => (
            <tr key={item.id}>
              <td className={`${td} text-[#555555]`}>{i + 1}</td>
              <td className={`${td} pr-3`}>
                <div className="font-medium">{item.product_name}</div>
                <div className="font-mono text-xs leading-4 text-[#555555]">{item.product_sku}</div>
              </td>
              <td className={`${td} text-right`}>{item.quantity}</td>
              <td className={`${td} text-right`}>{money(item.unit_price)}</td>
              <td className={`${td} text-right font-medium`}>{money(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <section className="flex justify-end">
        <dl className="flex w-80 flex-col gap-1.5 text-[15px]">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd>{money(invoice.subtotal)}</dd>
          </div>
          {Number(invoice.discount) > 0 && (
            <>
              <div className="flex justify-between">
                <dt>Discount</dt>
                <dd>− {money(invoice.discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Taxable amount</dt>
                <dd>{money(taxable)}</dd>
              </div>
            </>
          )}
          <div className="flex justify-between">
            <dt>VAT {rate}</dt>
            <dd>{money(invoice.tax_amount)}</dd>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between border-t-2 border-[#111111] pt-2.5">
            <dt className="font-bold">Total due</dt>
            <dd className="text-[22px] leading-7 font-bold">{money(invoice.total)}</dd>
          </div>
        </dl>
      </section>

      <div className="flex-1" />

      <footer className="flex items-end justify-between gap-6 border-t border-[#bbbbbb] pt-4 text-xs leading-[18px] text-[#555555]">
        <div className="flex max-w-[420px] flex-col gap-0.5">
          <span>
            All amounts in {settings.currency}. VAT charged at {rate}.
          </span>
          <span>Thank you for your business.</span>
        </div>
        <div className="text-right">Printed {formatDocumentDateTime(new Date().toISOString())}</div>
      </footer>
    </article>
  )
}
