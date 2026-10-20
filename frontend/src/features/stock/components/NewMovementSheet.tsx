/** Side sheet for recording an IN, OUT or ADJUSTMENT movement (STK-1 … STK-4). */
import { CircleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { MOVEMENT_STYLES } from '@/components/common/movement-styles'
import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { useProduct } from '@/features/products'
import { formatSignedQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/models'

import { useRecordMovement } from '../api/queries'
import type { ManualMovementType } from '../types'
import { ProductPicker } from './ProductPicker'

/** The movement types a person can record, with help text. */
const KINDS: Array<{ type: ManualMovementType; label: string; help: string }> = [
  { type: 'IN', label: 'IN', help: 'Received' },
  { type: 'OUT', label: 'OUT', help: 'Removed / damaged' },
  { type: 'ADJUSTMENT', label: 'ADJUST', help: 'Set counted qty' },
]

/** Example note for each type. */
const NOTE_PLACEHOLDER: Record<ManualMovementType, string> = {
  IN: 'Delivery note or supplier reference (optional)',
  OUT: 'Why is stock leaving? e.g. damaged, expired',
  ADJUSTMENT: 'What did the count find?',
}

/** Props for NewMovementSheet. */
interface NewMovementSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialProductId?: number
  initialType?: ManualMovementType
}

/** Records IN / OUT / ADJUSTMENT. Previews the resulting balance and blocks negatives (STK-4). */
export function NewMovementSheet({ open, onOpenChange, initialProductId, initialType }: NewMovementSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] gap-0 p-0 sm:max-w-[420px]">
        <SheetHeader className="border-b px-5 py-[18px]">
          <SheetTitle className="text-[17px] font-semibold">New stock movement</SheetTitle>
          <SheetDescription className="sr-only">Record stock received, removed or counted.</SheetDescription>
        </SheetHeader>
        {/* The sheet unmounts its content when closed, so every opening starts with a fresh form. */}
        <MovementForm initialProductId={initialProductId} initialType={initialType} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}

/** The movement form. Shows the resulting quantity and blocks going below zero. */
function MovementForm({ initialProductId, initialType, onDone }: { initialProductId?: number; initialType?: ManualMovementType; onDone: () => void }) {
  const record = useRecordMovement()
  const preselected = useProduct(initialProductId ?? NaN)
  const [picked, setPicked] = useState<Product | null>(null)
  const [type, setType] = useState<ManualMovementType>(initialType ?? 'IN')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const product = picked ?? preselected.data ?? null

  const qty = /^\d+$/.test(quantity) ? Number(quantity) : null
  const onHand = product?.quantity ?? 0
  const after = qty === null ? null : type === 'IN' ? onHand + qty : type === 'OUT' ? onHand - qty : qty
  const delta = after === null ? 0 : after - onHand

  let error: string | null = null
  if (quantity !== '' && (qty === null || (type !== 'ADJUSTMENT' && qty === 0))) error = 'Enter a quantity greater than zero.'
  else if (after !== null && after < 0) error = `Only ${onHand} in stock. Removing ${qty} would leave ${after}, and quantity can’t go below zero.`
  else if (type === 'ADJUSTMENT' && qty !== null && delta === 0) error = `The counted quantity matches the system (${onHand}).`
  const noteMissing = type !== 'IN' && !note.trim()
  const canSave = !!product && qty !== null && !error && !noteMissing && !record.isPending

  const submit = () => {
    if (!product || qty === null || !canSave) return
    record.mutate(
      { product_id: product.id, type, quantity: qty, note: note.trim() },
      {
        onSuccess: (movement) => {
          toast.success('Movement recorded', {
            description: `${type} ${formatSignedQuantity(movement.quantity)} · ${product.name} now ${movement.balance_after}`,
          })
          onDone()
        },
        onError: (e) => toast.error('Couldn’t record movement', { description: e.message }),
      },
    )
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-[18px] overflow-y-auto p-5">
        <FormField
          label="Product"
          help={
            product && (
              <>
                On hand now: <strong className={cn('font-semibold', product.is_low_stock ? 'text-warning' : 'text-foreground')}>{product.quantity}</strong> ·
                minimum {product.min_quantity}
              </>
            )
          }
        >
          {({ id }) => <ProductPicker id={id} value={product} onChange={setPicked} />}
        </FormField>

        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-[13px] font-medium">Type</legend>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((kind) => {
              const selected = kind.type === type
              const style = MOVEMENT_STYLES[kind.type]
              return (
                <button
                  key={kind.type}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setType(kind.type)}
                  className={cn(
                    'flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-colors',
                    selected ? cn(style.className, 'border-current ring-1 ring-current') : 'bg-card hover:bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'text-xs font-bold',
                      style.className.split(' ').find((c) => c.startsWith('text-')),
                    )}
                  >
                    {kind.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{kind.help}</span>
                </button>
              )
            })}
          </div>
          <span className="text-xs text-muted-foreground">SALE movements are created automatically by invoices.</span>
        </fieldset>

        <FormField label={type === 'ADJUSTMENT' ? 'Counted quantity' : 'Quantity'}>
          {(f) => (
            <Input
              id={f.id}
              type="number"
              min={0}
              inputMode="numeric"
              className="h-[38px]"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? 'movement-error' : undefined}
            />
          )}
        </FormField>

        <div
          className={cn(
            'flex items-center justify-between rounded-lg border px-3.5 py-3',
            after !== null && after < 0 ? 'border-danger-line bg-danger-soft' : 'bg-subtle',
          )}
        >
          <span className="text-[13px] text-subtle-foreground">Result</span>
          <span className="text-[15px] font-semibold">
            <span className="font-normal text-muted-foreground">{onHand} → </span>
            <span
              className={cn(
                after !== null && after < 0 ? 'text-danger' : product && after !== null && after <= product.min_quantity ? 'text-warning' : 'text-foreground',
              )}
            >
              {after ?? '—'}
            </span>
          </span>
        </div>

        {error && (
          <div
            id="movement-error"
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-danger-line bg-danger-soft px-3 py-2.5 text-[13px] text-danger"
          >
            <CircleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <FormField label="Note" hint={type === 'IN' ? 'Optional' : 'Required for OUT and ADJUSTMENT'}>
          {(f) => <Textarea id={f.id} rows={3} value={note} placeholder={NOTE_PLACEHOLDER[type]} onChange={(e) => setNote(e.target.value)} />}
        </FormField>
      </div>

      <SheetFooter className="mt-0 flex-row justify-end gap-2 border-t px-5 py-3.5">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!canSave}>
          {record.isPending ? 'Recording…' : 'Record movement'}
        </Button>
      </SheetFooter>
    </>
  )
}
