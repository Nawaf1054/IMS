/** /products: the product list with filters, sorting, paging, Excel export and delete. */
import { DownloadIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Pagination } from '@/components/common/Pagination'
import { EmptyState } from '@/components/feedback/EmptyState'
import { InlineAlert } from '@/components/feedback/InlineAlert'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { useIsAdmin } from '@/features/auth'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { saveBlob } from '@/lib/download'
import { formatNumber } from '@/lib/format'
import type { Product } from '@/types/models'

import { useLowStockCount, useProducts } from '../api/queries'
import { productsApi } from '../api/products.api'
import { DeleteProductDialog } from '../components/DeleteProductDialog'
import { ProductFilters } from '../components/ProductFilters'
import { ProductCards, ProductsTable } from '../components/ProductsTable'
import { toListParams, useProductFilters } from '../hooks/use-product-filters'
import type { ProductSortKey } from '../types'

/** Product list. Filters live in the URL; the search box is debounced. */
export function ProductsPage() {
  const isAdmin = useIsAdmin()
  const { filters, update, clear, isFiltered } = useProductFilters()
  const [searchDraft, setSearchDraft] = useState(filters.search)
  const search = useDebouncedValue(searchDraft)
  const [toDelete, setToDelete] = useState<Product | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (search !== filters.search) update({ search })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync the debounced box into the URL only when it settles
  }, [search])

  const params = toListParams(filters, filters.search)
  const { data, isPending, isError, error, refetch, isPlaceholderData } = useProducts(params)
  const { data: allProducts } = useProducts({ page_size: 1, include_inactive: true })
  const { data: lowCount } = useLowStockCount()

  const sortBy = (key: ProductSortKey) => update({ sort: key, order: filters.sort === key && filters.order === 'asc' ? 'desc' : 'asc' })
  const clearAll = () => {
    setSearchDraft('')
    clear()
  }

  const exportExcel = async () => {
    setExporting(true)
    try {
      // EXP-5: the export uses exactly the filters on screen.
      const { blob, filename } = await productsApi.export({ ...params, page: undefined, page_size: undefined })
      saveBlob(blob, filename)
      toast.success(`Export ready · ${filename}`, { description: isFiltered ? `${data?.total ?? 0} rows · filters applied` : 'All products' })
    } catch (e) {
      toast.error('Export failed', { description: e instanceof Error ? e.message : undefined })
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page>
      <PageHeader
        title="Products"
        description={
          <>
            {allProducts ? `${formatNumber(allProducts.total)} products` : 'Products'}
            {!!lowCount && (
              <>
                {' · '}
                <button type="button" className="font-medium text-warning hover:underline" onClick={() => update({ lowOnly: true })}>
                  {lowCount} low stock
                </button>
              </>
            )}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={exportExcel} disabled={exporting}>
              <DownloadIcon />
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
            {isAdmin && (
              <Button asChild>
                <Link to="/products/new">
                  <PlusIcon />
                  New product
                </Link>
              </Button>
            )}
          </>
        }
      />

      {!isAdmin && <InlineAlert tone="muted">View only. Adding, editing prices and deleting products are admin actions.</InlineAlert>}

      <ProductFilters
        filters={filters}
        searchDraft={searchDraft}
        onSearchChange={setSearchDraft}
        onChange={update}
        onClear={clearAll}
        isFiltered={isFiltered}
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : !isPending && data.items.length === 0 ? (
          <EmptyState
            icon={SearchIcon}
            title={isFiltered ? 'No products match these filters' : 'No products yet'}
            description={isFiltered ? 'Try a different name or SKU, or clear the category and low-stock filters.' : 'Products you add will show up here.'}
            action={
              isFiltered ? (
                <Button variant="outline" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : (
                isAdmin && (
                  <Button asChild>
                    <Link to="/products/new">New product</Link>
                  </Button>
                )
              )
            }
          />
        ) : (
          <>
            <div className={isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
              <div className="hidden md:block">
                <ProductsTable
                  products={data?.items ?? []}
                  loading={isPending}
                  sort={filters.sort}
                  order={filters.order}
                  onSort={sortBy}
                  isAdmin={isAdmin}
                  onDelete={setToDelete}
                />
              </div>
              <div className="md:hidden">{data && <ProductCards products={data.items} />}</div>
            </div>
            {data && (
              <Pagination
                page={data.page}
                pageSize={data.page_size}
                total={data.total}
                onPageChange={(page) => update({ page })}
                onPageSizeChange={(pageSize) => update({ pageSize })}
                summary={isFiltered ? `${formatNumber(data.total)} ${data.total === 1 ? 'result' : 'results'} · filters applied` : undefined}
              />
            )}
          </>
        )}
      </div>

      <DeleteProductDialog product={toDelete} onClose={() => setToDelete(null)} />
    </Page>
  )
}
