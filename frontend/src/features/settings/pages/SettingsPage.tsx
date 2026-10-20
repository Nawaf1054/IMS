/** /settings (admin): business name, address, currency and tax rate, with a worked tax example. */
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/common/FormField'
import { Panel, PanelHeader } from '@/components/common/Panel'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatMoney } from '@/lib/format'
import { applyRate, fromCents } from '@/lib/money'
import type { BusinessSettings } from '@/types/models'

import { useSettings, useUpdateSettings } from '../api/queries'

/** Currencies the business can choose (must match the backend's list). */
const CURRENCIES = [
  { code: 'SAR', name: 'Saudi riyal' },
  { code: 'AED', name: 'UAE dirham' },
  { code: 'KWD', name: 'Kuwaiti dinar' },
  { code: 'USD', name: 'US dollar' },
]

/** Settings form validation. */
const schema = z.object({
  business_name: z.string().trim().min(1, 'Business name is required. It appears on every invoice.'),
  business_address: z.string(),
  currency: z.string(),
  tax_percent: z
    .string()
    .trim()
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v) && Number(v) <= 100, 'Enter a rate between 0 and 100.'),
})

type Values = z.infer<typeof schema>

/** "0.15" ↔ "15" without floating-point noise. */
const toPercent = (rate: string) => String(Number((Number(rate) * 100).toFixed(2)))
/** Percent from the form → tax rate fraction, e.g. "15" → "0.15". */
const toRate = (percent: string) => String(Number((Number(percent) / 100).toFixed(4)))

/** Form values for the saved settings. */
const toValues = (s: BusinessSettings): Values => ({
  business_name: s.business_name,
  business_address: s.business_address,
  currency: s.currency,
  tax_percent: toPercent(s.tax_rate),
})

const EXAMPLE_SUBTOTAL = 125_000

/** The settings form. Saving updates the cached settings right away. */
export function SettingsPage() {
  const { data: settings, isPending, isError, error, refetch } = useSettings()
  const update = useUpdateSettings()
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: settings && toValues(settings) })

  useEffect(() => {
    if (settings) reset(toValues(settings))
  }, [settings, reset])

  const [name, address, currency, percent] = useWatch({ control, name: ['business_name', 'business_address', 'currency', 'tax_percent'] })
  const percentValid = /^\d+(\.\d{1,2})?$/.test(percent ?? '') && Number(percent) <= 100
  const tax = percentValid ? applyRate(EXAMPLE_SUBTOTAL, toRate(percent)) : 0
  const preview = (cents: number) => formatMoney(fromCents(cents), currency || 'SAR')

  const save = handleSubmit(async (values) => {
    try {
      const saved = await update.mutateAsync({
        business_name: values.business_name.trim(),
        business_address: values.business_address.trim(),
        currency: values.currency,
        tax_rate: toRate(values.tax_percent),
      })
      toast.success('Settings saved', { description: `New invoices use ${saved.currency} and VAT ${toPercent(saved.tax_rate)}%` })
    } catch (e) {
      toast.error('Couldn’t save settings', { description: e instanceof Error ? e.message : undefined })
    }
  })

  return (
    <Page width="md" className="max-w-[1080px]">
      <PageHeader title="Settings" description="Business details used on invoices, exports and the dashboard." />
      {isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <Skeleton className="h-[480px]" />
      ) : (
        <form noValidate onSubmit={save} className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel aria-labelledby="business-heading" className="flex flex-col gap-4 p-5">
              <PanelHeader id="business-heading" title="Business" description="Printed at the top of every invoice." />
              <FormField label="Business name" error={errors.business_name?.message}>
                {(f) => <Input id={f.id} className="h-[38px]" aria-invalid={f.invalid} aria-describedby={f.describedBy} {...register('business_name')} />}
              </FormField>
              <FormField label="Business address">{(f) => <Textarea id={f.id} rows={3} className="resize-y" {...register('business_address')} />}</FormField>
            </Panel>

            <Panel aria-labelledby="money-heading" className="flex flex-col gap-4 p-5">
              <PanelHeader
                id="money-heading"
                title="Currency & tax"
                description="Changes apply to new invoices. Saved invoices keep the rate they were created with."
              />
              <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
                <FormField label="Currency" help={`Shown as ${preview(EXAMPLE_SUBTOTAL)}`}>
                  {(f) => (
                    <NativeSelect id={f.id} className="w-full [&_select]:h-[38px]" aria-describedby={f.describedBy} {...register('currency')}>
                      {CURRENCIES.map((c) => (
                        <NativeSelectOption key={c.code} value={c.code}>
                          {c.code} · {c.name}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
                <FormField label="Tax rate (VAT)" error={errors.tax_percent?.message} help="Percentage added to new invoices. 0 means no VAT.">
                  {(f) => (
                    <span className="relative flex items-center">
                      <Input
                        id={f.id}
                        inputMode="decimal"
                        className="h-[38px] pr-[34px] text-right"
                        aria-invalid={f.invalid}
                        aria-describedby={f.describedBy}
                        {...register('tax_percent')}
                      />
                      <span aria-hidden="true" className="absolute right-3 text-muted-foreground">
                        %
                      </span>
                    </span>
                  )}
                </FormField>
              </div>
            </Panel>

            <div className="flex items-center justify-end gap-2">
              {isDirty && <span className="mr-auto text-[13px] text-muted-foreground">Unsaved changes</span>}
              <Button type="button" variant="outline" disabled={!isDirty || isSubmitting} onClick={() => settings && reset(toValues(settings))}>
                Discard
              </Button>
              <Button type="submit" disabled={!isDirty || isSubmitting}>
                {isSubmitting ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-2.5">
            <span className="text-eyebrow text-muted-foreground">Invoice preview</span>
            <div
              aria-label="Preview of the printed invoice header"
              className="flex flex-col gap-3.5 rounded-lg border bg-white p-5 text-[#111111] shadow-[0_1px_2px_rgba(0,0,0,.04)]"
            >
              <div className="flex justify-between gap-3 border-b-2 border-[#111111] pb-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold">{name?.trim() || '[Business name]'}</div>
                  <div className="text-[11px] leading-[15px] whitespace-pre-line text-[#444444]">{address}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[9px] font-semibold tracking-[0.12em] text-[#444444]">TAX INVOICE</div>
                  <div className="font-mono text-[11px]">INV-0000-00000</div>
                </div>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>{preview(EXAMPLE_SUBTOTAL)}</span>
                </div>
                <div className="flex justify-between">
                  <span>VAT {percentValid ? Number(percent) : '—'}%</span>
                  <span>{preview(tax)}</span>
                </div>
                <div className="flex justify-between border-t border-[#111111] pt-1 font-bold">
                  <span>Total</span>
                  <span>{preview(EXAMPLE_SUBTOTAL + tax)}</span>
                </div>
              </div>
            </div>
            <span className="text-xs text-muted-foreground">Example on a {preview(EXAMPLE_SUBTOTAL)} sale.</span>
          </aside>
        </form>
      )}
    </Page>
  )
}
