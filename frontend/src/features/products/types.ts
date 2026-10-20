/** Request types for the product endpoints. */
import type { DateRangeParams, Money, PageParams } from '@/types/api'
import type { MovementType } from '@/types/models'

/** Columns the product list can sort by. */
export type ProductSortKey = 'name' | 'sku' | 'category' | 'cost_price' | 'sell_price' | 'quantity'

/** GET /products query (PRD-3: search, filter, sort, paginate). */
export interface ProductListParams extends PageParams {
  search?: string
  category_id?: number
  low_stock?: boolean
  include_inactive?: boolean
  sort?: ProductSortKey
  order?: 'asc' | 'desc'
}

/** GET /products/{id}/movements query. */
export interface ProductMovementParams extends PageParams, DateRangeParams {
  type?: MovementType
}

/** Create/update body. Quantity is deliberately absent (PRD-4). */
export interface ProductInput {
  name: string
  sku: string
  category_id: number
  cost_price: Money
  sell_price: Money
  min_quantity: number
  description: string
  is_active: boolean
}

/** What deleting did: removed the product, or only deactivated it. */
export type DeleteProductResult = { result: 'deleted' | 'deactivated' }
