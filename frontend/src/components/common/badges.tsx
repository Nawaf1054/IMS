/** Domain badges used on several screens. Mapping of states to tones lives here only. */
import { CheckIcon, XIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { InvoiceStatus, MovementType, Product, Role } from '@/types/models'

import { MOVEMENT_STYLES } from './movement-styles'
import { StatusBadge } from './StatusBadge'

/** Low stock / Out of stock / Inactive (nothing when the product is healthy). */
export function StockStatusBadge({ product, size }: { product: Pick<Product, 'is_active' | 'quantity' | 'is_low_stock'>; size?: 'sm' | 'default' }) {
  if (!product.is_active)
    return (
      <StatusBadge tone="neutral" dot size={size}>
        Inactive
      </StatusBadge>
    )
  if (product.quantity === 0)
    return (
      <StatusBadge tone="danger" dot size={size}>
        Out of stock
      </StatusBadge>
    )
  if (product.is_low_stock)
    return (
      <StatusBadge tone="warning" dot size={size}>
        Low stock
      </StatusBadge>
    )
  return null
}

/** Green "Completed" or red "Cancelled" for an invoice. */
export function InvoiceStatusBadge({ status, size }: { status: InvoiceStatus; size?: 'sm' | 'default' }) {
  return status === 'COMPLETED' ? (
    <StatusBadge tone="success" size={size} icon={<CheckIcon className="size-3" strokeWidth={2.5} aria-hidden="true" />}>
      Completed
    </StatusBadge>
  ) : (
    <StatusBadge tone="danger" size={size} icon={<XIcon className="size-3" strokeWidth={2.5} aria-hidden="true" />}>
      Cancelled
    </StatusBadge>
  )
}

/** Coloured IN / OUT / ADJUSTMENT / SALE label with its icon. */
export function MovementTypeBadge({ type, compact }: { type: MovementType; compact?: boolean }) {
  const style = MOVEMENT_STYLES[type]
  const Icon = style.icon
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-md font-semibold whitespace-nowrap',
        compact ? 'h-[22px] px-[7px] text-[11px]' : 'h-6 px-2 text-xs',
        style.className,
      )}
    >
      {!compact && <Icon className="size-[13px]" strokeWidth={2.2} aria-hidden="true" />}
      {style.label}
    </span>
  )
}

/** "Admin" or "Staff" label. */
export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center rounded-md px-[7px] text-[11px] font-semibold tracking-[0.02em]',
        role === 'admin' ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-muted text-subtle-foreground',
      )}
    >
      {role === 'admin' ? 'ADMIN' : 'STAFF'}
    </span>
  )
}
