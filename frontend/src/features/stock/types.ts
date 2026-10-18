import type { DateRangeParams, PageParams } from '@/types/api'
import type { MovementType } from '@/types/models'

export interface MovementListParams extends PageParams, DateRangeParams {
  type?: MovementType
  product_id?: number
}

/** Manual movement types; SALE is created by invoices only (STK-1). */
export type ManualMovementType = Exclude<MovementType, 'SALE'>

/**
 * POST /stock-movements. For IN and OUT `quantity` is the amount moved; for
 * ADJUSTMENT it is the counted quantity on hand (the backend records the difference).
 */
export interface MovementInput {
  product_id: number
  type: ManualMovementType
  quantity: number
  note: string
}
