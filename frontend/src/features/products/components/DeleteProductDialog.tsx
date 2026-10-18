import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import type { Product } from '@/types/models'

import { useDeleteProduct } from '../api/queries'

interface DeleteProductDialogProps {
  product: Pick<Product, 'id' | 'name' | 'invoice_count'> | null
  onClose: () => void
  onDone?: (result: 'deleted' | 'deactivated') => void
}

/** PRD-2: products on invoices are deactivated instead of deleted; the dialog says which will happen. */
export function DeleteProductDialog({ product, onClose, onDone }: DeleteProductDialogProps) {
  const remove = useDeleteProduct()
  const soft = (product?.invoice_count ?? 0) > 0

  const confirm = () => {
    if (!product) return
    remove.mutate(product.id, {
      onSuccess: ({ result }) => {
        toast.success(result === 'deactivated' ? 'Product deactivated' : 'Product deleted', { description: product.name })
        onClose()
        onDone?.(result)
      },
      onError: (error) => toast.error('Couldn’t remove product', { description: error.message }),
    })
  }

  return (
    <ConfirmDialog
      open={!!product}
      onOpenChange={(open) => !open && onClose()}
      title={soft ? `Deactivate “${product?.name}”?` : `Delete “${product?.name}”?`}
      description={
        soft
          ? `This product appears on ${product?.invoice_count} invoices, so it can’t be deleted. It will be marked inactive and hidden from new invoices; its history stays intact.`
          : 'This permanently removes the product. This can’t be undone.'
      }
      confirmLabel={soft ? 'Deactivate product' : 'Delete product'}
      onConfirm={confirm}
      pending={remove.isPending}
    />
  )
}
