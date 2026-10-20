/** Dashboard table of products at or below their minimum quantity (DSH-5). */
import { CircleCheckIcon } from 'lucide-react'
import { Link } from 'react-router'

import { StockStatusBadge } from '@/components/common/badges'
import { Panel, PanelHeader } from '@/components/common/Panel'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/feedback/EmptyState'
import { QueryError } from '@/components/feedback/QueryError'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useProducts } from '@/features/products'
import { cn } from '@/lib/utils'

/** DSH-5: products at or below their minimum quantity (current stock, not range-based). */
export function LowStockCard() {
  const { data, isPending, isError, error, refetch } = useProducts({ low_stock: true, sort: 'quantity', page_size: 10 })

  return (
    <Panel id="low-stock" aria-labelledby="low-heading" className="flex scroll-mt-20 flex-col">
      <PanelHeader
        id="low-heading"
        className="px-5 pt-5 pb-3.5"
        title={
          <>
            Low-stock products
            {!!data?.total && (
              <StatusBadge tone="warning" className="h-5 px-[7px] font-semibold">
                {data.total}
              </StatusBadge>
            )}
          </>
        }
        description="Quantity at or below minimum · current stock, not range-based"
        actions={
          <Link to="/products?low=1" className="text-[13px] font-medium text-primary-soft-foreground hover:text-primary">
            View in Products
          </Link>
        }
      />
      {isError ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isPending ? (
        <div className="flex flex-col gap-3 px-5 pb-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9" />
          ))}
        </div>
      ) : !data.items.length ? (
        <EmptyState icon={CircleCheckIcon} title="Everything is above minimum" description="Products show up here when their quantity drops to the minimum." />
      ) : (
        <Table className="min-w-[520px] border-t">
          <TableHeader>
            <TableRow>
              <TableHead className="px-5">Product</TableHead>
              <TableHead className="text-right">Qty / min</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="px-5">
                <span className="sr-only">Action</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="px-5 py-2.5">
                  <Link to={`/products/${product.id}`} className="block font-medium text-foreground hover:text-primary-soft-foreground">
                    {product.name}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <span className={cn('font-semibold', product.quantity === 0 ? 'text-danger' : 'text-warning')}>{product.quantity}</span>
                  <span className="text-muted-foreground"> / {product.min_quantity}</span>
                </TableCell>
                <TableCell>
                  <StockStatusBadge product={product} />
                </TableCell>
                <TableCell className="px-5 text-right">
                  <Link
                    to={`/stock?new=1&product=${product.id}&type=IN`}
                    className="text-[13px] font-medium whitespace-nowrap text-primary-soft-foreground hover:text-primary"
                  >
                    Receive stock
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Panel>
  )
}
