import { PencilIcon, Trash2Icon } from 'lucide-react'
import { Link } from 'react-router'

import { StockStatusBadge } from '@/components/common/badges'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useMoney } from '@/features/settings'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/models'

import type { ProductSortKey } from '../types'
import { quantityTone } from '../utils/quantity-tone'

const COLUMNS: Array<{ key: ProductSortKey; label: string; align?: 'right' }> = [
  { key: 'name', label: 'Product' },
  { key: 'sku', label: 'SKU' },
  { key: 'category', label: 'Category' },
  { key: 'cost_price', label: 'Cost', align: 'right' },
  { key: 'sell_price', label: 'Sell price', align: 'right' },
  { key: 'quantity', label: 'Quantity', align: 'right' },
]

interface ProductsTableProps {
  products: Product[]
  loading: boolean
  sort: ProductSortKey
  order: 'asc' | 'desc'
  onSort: (key: ProductSortKey) => void
  isAdmin: boolean
  onDelete: (product: Product) => void
}

export function ProductsTable({ products, loading, sort, order, onSort, isAdmin, onDelete }: ProductsTableProps) {
  const money = useMoney()
  return (
    <Table className="min-w-[980px]">
      <TableHeader>
        <TableRow>
          {COLUMNS.map((column) => {
            const active = sort === column.key
            return (
              <TableHead
                key={column.key}
                aria-sort={active ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={cn('px-2', column.align === 'right' && 'text-right')}
              >
                <button
                  type="button"
                  onClick={() => onSort(column.key)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium hover:bg-muted',
                    active ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {column.label}
                  <span aria-hidden="true" className="w-2 text-[10px]">
                    {active ? (order === 'asc' ? '▲' : '▼') : ''}
                  </span>
                </button>
              </TableHead>
            )
          })}
          <TableHead>Status</TableHead>
          <TableHead className="w-24">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading
          ? Array.from({ length: 8 }, (_, i) => (
              <TableRow key={i}>
                <TableCell colSpan={8}>
                  <div className="flex items-center gap-6">
                    <Skeleton className="h-3 w-[26%]" />
                    <Skeleton className="h-3 w-[12%]" />
                    <Skeleton className="h-3 w-[14%]" />
                    <Skeleton className="h-3 flex-1" />
                  </div>
                </TableCell>
              </TableRow>
            ))
          : products.map((product) => (
              <TableRow key={product.id} className={cn(!product.is_active && 'opacity-60')}>
                <TableCell>
                  <Link to={`/products/${product.id}`} className="font-medium text-foreground hover:text-primary-soft-foreground">
                    {product.name}
                  </Link>
                </TableCell>
                <TableCell className="text-code whitespace-nowrap text-subtle-foreground">{product.sku}</TableCell>
                <TableCell className="whitespace-nowrap text-subtle-foreground">{product.category_path}</TableCell>
                <TableCell className="text-right whitespace-nowrap text-subtle-foreground">{money(product.cost_price)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{money(product.sell_price)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <span className={quantityTone(product)}>{formatNumber(product.quantity)}</span>
                  <span className="text-xs text-muted-foreground"> / {formatNumber(product.min_quantity)}</span>
                </TableCell>
                <TableCell>
                  <StockStatusBadge product={product} />
                </TableCell>
                <TableCell className="px-2.5 text-right whitespace-nowrap">
                  {isAdmin ? (
                    <>
                      <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground" title="Edit">
                        <Link to={`/products/${product.id}/edit`} aria-label={`Edit ${product.name}`}>
                          <PencilIcon className="size-[15px]" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        title="Delete"
                        aria-label={`Delete ${product.name}`}
                        onClick={() => onDelete(product)}
                      >
                        <Trash2Icon className="size-[15px]" />
                      </Button>
                    </>
                  ) : (
                    <Link to={`/products/${product.id}`} className="px-1.5 text-[13px] font-medium text-primary-soft-foreground hover:text-primary">
                      View
                    </Link>
                  )}
                </TableCell>
              </TableRow>
            ))}
      </TableBody>
    </Table>
  )
}

/** Under 860px the table becomes a list of cards. */
export function ProductCards({ products }: { products: Product[] }) {
  const money = useMoney()
  return (
    <ul className="flex flex-col">
      {products.map((product) => (
        <li key={product.id} className={cn('border-b last:border-b-0', !product.is_active && 'opacity-60')}>
          <Link to={`/products/${product.id}`} className="flex flex-col gap-2 px-4 py-3.5 text-foreground hover:bg-subtle">
            <span className="flex items-start justify-between gap-3">
              <span className="font-medium">{product.name}</span>
              <span className="font-semibold whitespace-nowrap">{money(product.sell_price)}</span>
            </span>
            <span className="flex justify-between gap-3 text-xs text-muted-foreground">
              <span>
                <span className="font-mono">{product.sku}</span> · {product.category_path}
              </span>
              <span className="whitespace-nowrap">
                Qty <strong className={quantityTone(product)}>{formatNumber(product.quantity)}</strong> / {product.min_quantity}
              </span>
            </span>
            <StockStatusBadge product={product} />
          </Link>
        </li>
      ))}
    </ul>
  )
}
