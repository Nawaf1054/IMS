/** /products/:id: product details, stock level, 30-day sales and movement history. */
import { ArrowLeftRightIcon, PackageXIcon, PencilIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router'

import { StockStatusBadge } from '@/components/common/badges'
import { FilterChips } from '@/components/common/FilterChips'
import { Panel, PanelHeader } from '@/components/common/Panel'
import { StatCard } from '@/components/common/StatCard'
import { StatusBadge } from '@/components/common/StatusBadge'
import { EmptyState } from '@/components/feedback/EmptyState'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsAdmin } from '@/features/auth'
import { useMoney } from '@/features/settings'
import { isApiError } from '@/lib/api-client'
import { formatDate, formatNumber, formatPercent } from '@/lib/format'
import { fromCents, toCents } from '@/lib/money'
import type { MovementType } from '@/types/models'

import { useProduct, useProductMovements } from '../api/queries'
import { MovementTimeline } from '../components/MovementTimeline'
import { StockLevelChart } from '../components/StockLevelChart'

type TypeFilter = MovementType | 'ALL'

/** Movement type filter chips. */
const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'IN', label: 'IN' },
  { value: 'OUT', label: 'OUT' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
  { value: 'SALE', label: 'Sale' },
]

/** The product page. Admins can edit; everyone can record a movement. */
export function ProductDetailPage() {
  const id = Number(useParams().id)
  const isAdmin = useIsAdmin()
  const money = useMoney()
  const [type, setType] = useState<TypeFilter>('ALL')
  const [pageSize, setPageSize] = useState(10)
  const { data: product, isPending, isError, error, refetch } = useProduct(id)
  const movements = useProductMovements(id, { type: type === 'ALL' ? undefined : type, page_size: pageSize })

  if (isError) {
    return (
      <Page>
        {isApiError(error, 'PRODUCT_NOT_FOUND') ? (
          <EmptyState
            bordered
            icon={PackageXIcon}
            title="Product not found"
            description="It may have been deleted."
            action={
              <Link to="/products" className="text-[13px] font-medium text-primary-soft-foreground">
                Back to products
              </Link>
            }
          />
        ) : (
          <QueryError error={error} onRetry={() => refetch()} />
        )}
      </Page>
    )
  }

  if (isPending) {
    return (
      <Page width="xl">
        <Skeleton className="h-16 w-1/2" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </Page>
    )
  }

  const cost = toCents(product.cost_price)
  const sell = toCents(product.sell_price)
  const margin = sell ? (sell - cost) / sell : 0
  const sales = product.sales_last_30_days
  const fill = product.min_quantity ? Math.min(1, product.quantity / Math.max(product.min_quantity * 1.25, 1)) : 1

  return (
    <Page width="xl" className="gap-5">
      <PageHeader
        breadcrumbs={[{ label: 'Products', to: '/products' }, { label: product.name }]}
        title={product.name}
        meta={
          <>
            <StockStatusBadge product={product} />
            {product.is_active && <StatusBadge tone="success">Active</StatusBadge>}
          </>
        }
        description={
          <span className="mt-1 flex flex-wrap gap-x-3.5 gap-y-1.5">
            <span className="font-mono text-subtle-foreground">{product.sku}</span>
            <span>{product.category_path}</span>
            <span>Updated {formatDate(product.updated_at)}</span>
          </span>
        }
        actions={
          <>
            {isAdmin && (
              <Button asChild variant="outline">
                <Link to={`/products/${product.id}/edit`}>
                  <PencilIcon />
                  Edit
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link to={`/stock?new=1&product=${product.id}`}>
                <ArrowLeftRightIcon />
                Record movement
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatCard
          tone={product.is_low_stock && product.is_active ? 'warning' : 'default'}
          label="Quantity on hand"
          value={
            <span className="text-[28px] leading-9">
              {formatNumber(product.quantity)} <span className="text-sm font-normal text-subtle-foreground">units</span>
            </span>
          }
          detail={product.is_low_stock ? `At or below minimum of ${product.min_quantity}` : `Minimum ${product.min_quantity}`}
          meter={
            <span className="mt-1 h-1.5 overflow-hidden rounded-[3px] bg-warning-line/60">
              <span className={product.is_low_stock ? 'block h-full bg-warning' : 'block h-full bg-chart-1'} style={{ width: `${fill * 100}%` }} />
            </span>
          }
        />
        <StatCard label="Sell price" value={money(product.sell_price)} detail={`Cost ${money(product.cost_price)} · margin ${formatPercent(margin)}`} />
        <StatCard label="Stock value (cost)" value={money(fromCents(cost * product.quantity))} detail={`${product.quantity} × ${money(product.cost_price)}`} />
        <StatCard
          label="Sold · last 30 days"
          value={`${formatNumber(sales.quantity)} units`}
          detail={`${money(sales.revenue)} across ${sales.invoice_count} invoices${sales.cancelled_count ? ` · ${sales.cancelled_count} cancelled` : ''}`}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel aria-labelledby="history-heading">
          <PanelHeader
            id="history-heading"
            className="items-center border-b px-5 py-[18px]"
            title="Movement history"
            description="Movements are permanent. Corrections are made with a new adjustment."
            actions={<FilterChips label="Filter by type" size="sm" value={type} onChange={setType} options={TYPE_OPTIONS} />}
          />
          {movements.isPending ? (
            <div className="flex flex-col gap-4 p-5">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : movements.data?.items.length ? (
            <MovementTimeline movements={movements.data.items} />
          ) : (
            <p className="px-5 py-8 text-center text-[13px] text-muted-foreground">
              No {type === 'ALL' ? '' : `${type.toLowerCase()} `}movements for this product yet.
            </p>
          )}
          {movements.data && movements.data.total > movements.data.items.length && (
            <div className="flex justify-center border-t px-5 pt-3 pb-4">
              <Button variant="outline" size="sm" disabled={movements.isFetching} onClick={() => setPageSize((s) => s + 20)}>
                {movements.isFetching ? 'Loading…' : 'Load older movements'}
              </Button>
            </div>
          )}
        </Panel>

        <aside className="flex min-w-0 flex-col gap-4">
          <Panel className="flex flex-col gap-3 p-5">
            <h2 className="text-section-title">Details</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-muted-foreground">Category</dt>
              <dd>{product.category_path}</dd>
              <dt className="text-muted-foreground">Minimum qty</dt>
              <dd>{product.min_quantity}</dd>
              <dt className="text-muted-foreground">Cost price</dt>
              <dd>{money(product.cost_price)}</dd>
              <dt className="text-muted-foreground">Sell price</dt>
              <dd>{money(product.sell_price)}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>{formatDate(product.created_at)}</dd>
              {product.last_received_at && (
                <>
                  <dt className="text-muted-foreground">Last received</dt>
                  <dd>{formatDate(product.last_received_at)}</dd>
                </>
              )}
            </dl>
            {product.description && <p className="border-t pt-3 text-[13px] leading-5 text-subtle-foreground">{product.description}</p>}
          </Panel>
          <StockLevelChart product={product} />
        </aside>
      </div>
    </Page>
  )
}
