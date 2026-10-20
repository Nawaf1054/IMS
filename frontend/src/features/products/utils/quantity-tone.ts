/** Colour rule for showing a product's quantity. */
import type { Product } from '@/types/models'

/** Text colour for a quantity: red when out, amber when low, muted when inactive. */
export function quantityTone(product: Pick<Product, 'is_active' | 'quantity' | 'is_low_stock'>) {
  if (!product.is_active) return 'text-muted-foreground'
  if (product.quantity === 0) return 'text-danger font-semibold'
  if (product.is_low_stock) return 'text-warning font-semibold'
  return 'text-foreground'
}
