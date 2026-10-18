import { ArrowDownToLine, ArrowUpFromLine, ReceiptText, SlidersHorizontal } from 'lucide-react'

import type { MovementType } from '@/types/models'

/** One colour and icon per movement type, shared by badges, timelines and the movement form. */
export const MOVEMENT_STYLES: Record<MovementType, { label: string; className: string; icon: typeof ArrowDownToLine }> = {
  IN: { label: 'IN', className: 'bg-success-soft text-success', icon: ArrowDownToLine },
  OUT: { label: 'OUT', className: 'bg-danger-soft text-danger', icon: ArrowUpFromLine },
  ADJUSTMENT: { label: 'ADJUSTMENT', className: 'bg-info-soft text-info', icon: SlidersHorizontal },
  SALE: { label: 'SALE', className: 'bg-primary-soft text-primary-soft-foreground', icon: ReceiptText },
}
