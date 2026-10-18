import { Link } from 'react-router'

import { MOVEMENT_STYLES } from '@/components/common/movement-styles'
import { formatRelativeDateTime, formatSignedQuantity } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { StockMovement } from '@/types/models'

function title(movement: StockMovement): string {
  const amount = Math.abs(movement.quantity)
  switch (movement.type) {
    case 'SALE':
      return `Sold ${amount}`
    case 'OUT':
      return 'Removed'
    case 'ADJUSTMENT':
      return 'Count correction'
    case 'IN':
      return movement.invoice_id ? 'Stock restored' : movement.note === 'Opening stock' ? 'Opening stock' : 'Received'
  }
}

/** Vertical history of a product's movements; immutable records, newest first (STK-5, STK-6). */
export function MovementTimeline({ movements }: { movements: StockMovement[] }) {
  return (
    <ol className="px-5 pt-2 pb-1">
      {movements.map((movement, i) => {
        const style = MOVEMENT_STYLES[movement.type]
        const Icon = style.icon
        const last = i === movements.length - 1
        return (
          <li key={movement.id} className="relative grid grid-cols-[32px_minmax(0,1fr)_auto] gap-3.5 py-3">
            {!last && <span aria-hidden="true" className="absolute top-[46px] -bottom-3 left-[15px] w-px bg-border" />}
            <span className={cn('relative flex size-8 items-center justify-center rounded-full', style.className)}>
              <Icon className="size-[15px]" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div className="flex min-w-0 flex-col gap-[3px]">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'text-[11px] font-semibold tracking-[0.03em]',
                    style.className.split(' ').find((c) => c.startsWith('text-')),
                  )}
                >
                  {movement.type}
                </span>
                <span className="font-medium">{title(movement)}</span>
                {movement.invoice_number && movement.invoice_id && (
                  <Link to={`/invoices/${movement.invoice_id}`} className="font-mono text-xs text-primary-soft-foreground hover:text-primary">
                    {movement.invoice_number}
                  </Link>
                )}
              </div>
              {movement.note && movement.note !== 'Opening stock' && <span className="text-[13px] text-subtle-foreground">{movement.note}</span>}
              <span className="text-xs text-muted-foreground">
                {formatRelativeDateTime(movement.created_at)} · {movement.user_name}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 text-right">
              <span className={cn('font-semibold', movement.quantity > 0 ? 'text-success' : 'text-foreground')}>{formatSignedQuantity(movement.quantity)}</span>
              <span className="text-xs whitespace-nowrap text-muted-foreground">Balance {movement.balance_after}</span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
