import { zodResolver } from '@hookform/resolvers/zod'
import { LockIcon, SparklesIcon, TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/common/FormField'
import { MoneyInput } from '@/components/common/MoneyInput'
import { Panel } from '@/components/common/Panel'
import { InlineAlert } from '@/components/feedback/InlineAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useAiQuota, useGenerateDescription } from '@/features/assistant'
import { categoryOptions, useCategories } from '@/features/categories'
import { useCurrency } from '@/features/settings'
import { isApiError } from '@/lib/api-client'
import { formatMoney, formatPercent } from '@/lib/format'
import { fromCents, isMoneyInput, toCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { ProductDetail } from '@/types/models'

import type { ProductInput } from '../types'

const money = (label: string) => z.string().trim().refine(isMoneyInput, `${label} must be an amount, e.g. 19.00.`)

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  sku: z
    .string()
    .trim()
    .min(1, 'SKU is required.')
    .regex(/^[A-Za-z0-9-]+$/, 'Use letters, numbers and dashes only.'),
  category_id: z.string().min(1, 'Choose a category.'),
  cost_price: money('Cost price'),
  sell_price: money('Sell price'),
  min_quantity: z.string().trim().regex(/^\d+$/, 'Enter a whole number, zero or more.'),
  description: z.string(),
  is_active: z.boolean(),
})

type ProductFormValues = z.infer<typeof schema>

function toFormValues(product?: ProductDetail): ProductFormValues {
  return {
    name: product?.name ?? '',
    sku: product?.sku ?? '',
    category_id: product ? String(product.category_id) : '',
    cost_price: product?.cost_price ?? '',
    sell_price: product?.sell_price ?? '',
    min_quantity: String(product?.min_quantity ?? 0),
    description: product?.description ?? '',
    is_active: product?.is_active ?? true,
  }
}

interface ProductFormProps {
  product?: ProductDetail
  onSubmit: (input: ProductInput) => Promise<unknown>
  /** Renders the page header; receives the submit state. */
  header: (state: { submitting: boolean }) => React.ReactNode
  aside?: React.ReactNode
}

export function ProductForm({ product, onSubmit, header, aside }: ProductFormProps) {
  const currency = useCurrency()
  const { data: categories } = useCategories()
  const { data: quota } = useAiQuota()
  const generate = useGenerateDescription()
  const [aiState, setAiState] = useState<'idle' | 'draft' | 'edited'>('idle')

  const {
    register,
    control,
    handleSubmit,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting, submitCount },
  } = useForm<ProductFormValues>({ resolver: zodResolver(schema), defaultValues: toFormValues(product) })

  const [cost, sell, minQuantity] = useWatch({ control, name: ['cost_price', 'sell_price', 'min_quantity'] })
  const costCents = isMoneyInput(cost) ? toCents(cost) : 0
  const sellCents = isMoneyInput(sell) ? toCents(sell) : 0
  const marginCents = sellCents - costCents
  const belowCost = isMoneyInput(sell) && isMoneyInput(cost) && sellCents < costCents
  const options = categoryOptions(categories)
  const hasErrors = submitCount > 0 && Object.keys(errors).length > 0

  const generateDescription = () => {
    const { name, category_id } = getValues()
    const category = options.find((o) => String(o.id) === category_id)?.label ?? ''
    if (!name.trim()) {
      setError('name', { message: 'Enter a name first; the description is written from it.' })
      return
    }
    generate.mutate(
      { name, category },
      {
        onSuccess: ({ description }) => {
          setValue('description', description, { shouldDirty: true })
          setAiState('draft')
        },
        onError: (error) => toast.error('Couldn’t generate a description', { description: error.message }),
      },
    )
  }

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit({
        name: values.name.trim(),
        sku: values.sku.trim().toUpperCase(),
        category_id: Number(values.category_id),
        cost_price: fromCents(toCents(values.cost_price)),
        sell_price: fromCents(toCents(values.sell_price)),
        min_quantity: Number(values.min_quantity),
        description: values.description.trim(),
        is_active: values.is_active,
      })
    } catch (error) {
      if (isApiError(error, 'SKU_TAKEN')) setError('sku', { message: error.message })
      toast.error('Couldn’t save product', { description: error instanceof Error ? error.message : 'Fix the highlighted fields.' })
    }
  })

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      {header({ submitting: isSubmitting })}

      {hasErrors && <InlineAlert tone="error">Fix the highlighted fields before saving.</InlineAlert>}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel aria-labelledby="general-heading" className="flex flex-col gap-4 p-5">
            <h2 id="general-heading" className="text-section-title">
              General
            </h2>
            <FormField label="Name" error={errors.name?.message}>
              {(f) => <Input id={f.id} aria-invalid={f.invalid} aria-describedby={f.describedBy} {...register('name')} />}
            </FormField>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <FormField label="SKU" error={errors.sku?.message} help="Unique. Printed on invoices and exports.">
                {(f) => (
                  <Input id={f.id} className="font-mono text-[13px] uppercase" aria-invalid={f.invalid} aria-describedby={f.describedBy} {...register('sku')} />
                )}
              </FormField>
              <FormField label="Category" error={errors.category_id?.message}>
                {(f) => (
                  <NativeSelect id={f.id} className="w-full" aria-invalid={f.invalid} aria-describedby={f.describedBy} {...register('category_id')}>
                    <NativeSelectOption value="">Choose a category</NativeSelectOption>
                    {options.map((option) => (
                      <NativeSelectOption key={option.id} value={option.id}>
                        {option.label}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
            </div>
            <FormField
              label="Description"
              labelAction={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-primary-soft-foreground"
                  disabled={generate.isPending || quota?.remaining === 0}
                  onClick={generateDescription}
                >
                  <SparklesIcon />
                  {generate.isPending ? 'Writing…' : aiState === 'idle' ? 'AI: generate description' : 'Regenerate'}
                </Button>
              }
            >
              {(f) => (
                <>
                  <Textarea
                    id={f.id}
                    rows={5}
                    placeholder="What is it, what is it used for, what pairs with it"
                    className={cn('resize-y', aiState === 'draft' && 'bg-primary-soft')}
                    {...register('description', { onChange: () => aiState === 'draft' && setAiState('edited') })}
                  />
                  <span className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {generate.isPending
                        ? 'Generating from name and category…'
                        : aiState === 'draft'
                          ? 'AI draft from name and category — review before saving.'
                          : 'Optional. Shown on the product page only.'}
                    </span>
                    {quota && (
                      <span>
                        AI · {quota.remaining} of {quota.limit} requests left this hour
                      </span>
                    )}
                  </span>
                </>
              )}
            </FormField>
          </Panel>

          <Panel aria-labelledby="pricing-heading" className="flex flex-col gap-4 p-5">
            <h2 id="pricing-heading" className="text-section-title">
              Pricing
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
              <FormField label="Cost price" error={errors.cost_price?.message}>
                {(f) => (
                  <MoneyInput
                    id={f.id}
                    currency={currency}
                    placeholder="0.00"
                    aria-invalid={f.invalid}
                    aria-describedby={f.describedBy}
                    {...register('cost_price')}
                  />
                )}
              </FormField>
              <FormField label="Sell price" error={errors.sell_price?.message}>
                {(f) => (
                  <MoneyInput
                    id={f.id}
                    currency={currency}
                    placeholder="0.00"
                    className={cn(belowCost && 'border-warning')}
                    aria-invalid={f.invalid}
                    aria-describedby={f.describedBy}
                    {...register('sell_price')}
                  />
                )}
              </FormField>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium">Margin</span>
                <span className="flex h-9 items-center justify-between rounded-lg bg-muted px-3">
                  <span className="text-muted-foreground">{sellCents ? formatPercent(marginCents / sellCents) : '—'}</span>
                  <span className={cn('font-semibold', marginCents < 0 && 'text-danger')}>{formatMoney(fromCents(marginCents), currency)}</span>
                </span>
              </div>
            </div>
            {belowCost && (
              <span className="flex items-center gap-1.5 text-xs text-warning">
                <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
                Sell price is below cost. Invoices will record a loss on this product.
              </span>
            )}
            <p className="text-xs text-muted-foreground">Price changes apply to new invoices only. Past invoices keep the price at the time of sale.</p>
          </Panel>

          <Panel aria-labelledby="stock-heading" className="flex flex-col gap-4 p-5">
            <h2 id="stock-heading" className="text-section-title">
              Stock
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
              <div className="flex flex-col gap-1.5">
                <span id="qty-label" className="text-[13px] font-medium">
                  Quantity on hand
                </span>
                <div
                  aria-labelledby="qty-label"
                  className="flex h-9 items-center justify-between rounded-lg border border-dashed border-border-strong bg-muted px-3"
                >
                  <span className={cn('font-semibold', product?.is_low_stock && 'text-warning')}>{product?.quantity ?? 0} units</span>
                  <LockIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </div>
                <span className="text-xs text-muted-foreground">
                  {product ? (
                    <>
                      Changes only through stock movements and invoices.{' '}
                      <Link to={`/stock?new=1&product=${product.id}`} className="text-primary-soft-foreground hover:text-primary">
                        Record a movement
                      </Link>
                    </>
                  ) : (
                    'New products start at 0. Record an IN movement after saving.'
                  )}
                </span>
              </div>
              <FormField
                label="Minimum quantity"
                error={errors.min_quantity?.message}
                help={`Flagged as low stock at or below ${/^\d+$/.test(minQuantity) ? minQuantity : 'this number'}.`}
              >
                {(f) => (
                  <Input
                    id={f.id}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    aria-invalid={f.invalid}
                    aria-describedby={f.describedBy}
                    {...register('min_quantity')}
                  />
                )}
              </FormField>
            </div>
          </Panel>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel aria-labelledby="status-heading" className="flex flex-col gap-3.5 p-5">
            <h2 id="status-heading" className="text-section-title">
              Status
            </h2>
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <label className="flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="font-medium">Active</span>
                    <span className="text-xs text-muted-foreground">
                      {field.value ? 'Available for new invoices' : 'Hidden from new invoices; history kept'}
                    </span>
                  </span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          </Panel>
          {aside}
        </aside>
      </div>
    </form>
  )
}
