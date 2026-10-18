import { useSearchParams } from 'react-router'

import { DEFAULT_PAGE_SIZE } from '@/config/constants'

import type { ProductListParams, ProductSortKey } from '../types'

export interface ProductFilters {
  search: string
  categoryId: number | null
  lowOnly: boolean
  showInactive: boolean
  sort: ProductSortKey
  order: 'asc' | 'desc'
  page: number
  pageSize: number
}

const SORT_KEYS: ProductSortKey[] = ['name', 'sku', 'category', 'cost_price', 'sell_price', 'quantity']

/** Product list filters live in the URL so views can be linked and survive reloads. */
export function useProductFilters() {
  const [params, setParams] = useSearchParams()

  const filters: ProductFilters = {
    search: params.get('q') ?? '',
    categoryId: Number(params.get('category')) || null,
    lowOnly: params.get('low') === '1',
    showInactive: params.get('inactive') !== '0',
    sort: SORT_KEYS.includes(params.get('sort') as ProductSortKey) ? (params.get('sort') as ProductSortKey) : 'name',
    order: params.get('order') === 'desc' ? 'desc' : 'asc',
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: Number(params.get('size')) || DEFAULT_PAGE_SIZE,
  }

  /** Any change other than paging returns to the first page. */
  const update = (patch: Partial<ProductFilters>) => {
    const next = { ...filters, page: 1, ...patch }
    const out = new URLSearchParams()
    if (next.search) out.set('q', next.search)
    if (next.categoryId) out.set('category', String(next.categoryId))
    if (next.lowOnly) out.set('low', '1')
    if (!next.showInactive) out.set('inactive', '0')
    if (next.sort !== 'name') out.set('sort', next.sort)
    if (next.order === 'desc') out.set('order', 'desc')
    if (next.page > 1) out.set('page', String(next.page))
    if (next.pageSize !== DEFAULT_PAGE_SIZE) out.set('size', String(next.pageSize))
    setParams(out, { replace: true })
  }

  const clear = () => update({ search: '', categoryId: null, lowOnly: false, showInactive: true })
  const isFiltered = !!filters.search || !!filters.categoryId || filters.lowOnly || !filters.showInactive

  return { filters, update, clear, isFiltered }
}

export function toListParams(filters: ProductFilters, search: string): ProductListParams {
  return {
    search: search || undefined,
    category_id: filters.categoryId ?? undefined,
    low_stock: filters.lowOnly || undefined,
    include_inactive: filters.showInactive,
    sort: filters.sort,
    order: filters.order,
    page: filters.page,
    page_size: filters.pageSize,
  }
}
