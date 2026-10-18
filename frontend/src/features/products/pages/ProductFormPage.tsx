import { TriangleAlertIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'

import { Panel } from '@/components/common/Panel'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '@/lib/format'
import type { ProductDetail } from '@/types/models'

import { useCreateProduct, useProduct, useUpdateProduct } from '../api/queries'
import { DeleteProductDialog } from '../components/DeleteProductDialog'
import { ProductForm } from '../components/ProductForm'

function Header({ product, submitting }: { product?: ProductDetail; submitting: boolean }) {
  const cancelTo = product ? `/products/${product.id}` : '/products'
  return (
    <PageHeader
      breadcrumbs={
        product
          ? [{ label: 'Products', to: '/products' }, { label: product.name, to: cancelTo }, { label: 'Edit' }]
          : [{ label: 'Products', to: '/products' }, { label: 'New' }]
      }
      title={product ? 'Edit product' : 'New product'}
      actions={
        <>
          <Button asChild variant="outline">
            <Link to={cancelTo}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : product ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    />
  )
}

export function NewProductPage() {
  const navigate = useNavigate()
  const create = useCreateProduct()
  return (
    <Page width="lg" className="gap-5">
      <ProductForm
        header={({ submitting }) => <Header submitting={submitting} />}
        onSubmit={async (input) => {
          const product = await create.mutateAsync(input)
          toast.success('Product created', { description: `${product.name} · ${product.sku}` })
          navigate(`/products/${product.id}`)
        }}
      />
    </Page>
  )
}

export function EditProductPage() {
  const id = Number(useParams().id)
  const navigate = useNavigate()
  const { data: product, isPending, isError, error, refetch } = useProduct(id)
  const update = useUpdateProduct(id)
  const [confirmRemove, setConfirmRemove] = useState(false)

  if (isError)
    return (
      <Page>
        <QueryError error={error} onRetry={() => refetch()} />
      </Page>
    )
  if (isPending) {
    return (
      <Page width="lg">
        <Skeleton className="h-16 w-1/2" />
        <Skeleton className="h-[560px]" />
      </Page>
    )
  }

  return (
    <Page width="lg" className="gap-5">
      <ProductForm
        key={product.id}
        product={product}
        header={({ submitting }) => <Header product={product} submitting={submitting} />}
        onSubmit={async (input) => {
          const saved = await update.mutateAsync(input)
          toast.success('Product saved', { description: `${saved.name} · ${saved.sku}` })
          navigate(`/products/${saved.id}`)
        }}
        aside={
          <>
            {product.is_low_stock && product.is_active && (
              <section className="flex flex-col gap-1.5 rounded-lg border border-warning-line bg-warning-soft p-4">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-warning">
                  <TriangleAlertIcon className="size-3.5" aria-hidden="true" />
                  Low stock
                </span>
                <span className="text-[13px] text-subtle-foreground">
                  {product.quantity} on hand, minimum {product.min_quantity}.
                  {product.last_received_at && ` Last received ${formatDate(product.last_received_at)}.`}
                </span>
                <Link to={`/stock?new=1&product=${product.id}&type=IN`} className="text-[13px] font-medium text-warning hover:underline">
                  Receive stock →
                </Link>
              </section>
            )}
            <Panel className="flex flex-col gap-2 p-4 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{formatDate(product.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Last updated</span>
                <span>{formatDate(product.updated_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">On invoices</span>
                <span>{product.invoice_count}</span>
              </div>
            </Panel>
            <Button type="button" variant="destructive-outline" onClick={() => setConfirmRemove(true)}>
              {product.invoice_count > 0 ? 'Deactivate product…' : 'Delete product…'}
            </Button>
          </>
        }
      />
      <DeleteProductDialog
        product={confirmRemove ? product : null}
        onClose={() => setConfirmRemove(false)}
        onDone={(result) => navigate(result === 'deleted' ? '/products' : `/products/${product.id}`)}
      />
    </Page>
  )
}
