/** Searchable product dropdown used by the movement form. */
import { ChevronsUpDownIcon } from 'lucide-react'
import { useState } from 'react'

import { SearchInput } from '@/components/common/SearchInput'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useProducts } from '@/features/products'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/models'

interface ProductPickerProps {
  id?: string
  value: Product | null
  onChange: (product: Product) => void
}

/** Searchable product selector (name or SKU), active products only. */
export function ProductPicker({ id, value, onChange }: ProductPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const search = useDebouncedValue(query.trim(), 200)
  const { data, isFetching } = useProducts({ search: search || undefined, page_size: 8 }, { enabled: open })

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          className="flex h-[38px] w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 text-left outline-none focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/25"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value ? `${value.name} · ${value.sku}` : 'Choose a product'}</span>
          <ChevronsUpDownIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) gap-1.5 p-1.5">
        <SearchInput label="Search products" placeholder="Search by name or SKU" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} />
        <ul className="flex max-h-72 flex-col overflow-y-auto" role="listbox" aria-label="Products">
          {data?.items.map((product) => (
            <li key={product.id} role="option" aria-selected={value?.id === product.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(product)
                  setOpen(false)
                  setQuery('')
                }}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted', value?.id === product.id && 'bg-primary-soft')}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
                </span>
                <span className={cn('text-xs whitespace-nowrap', product.is_low_stock ? 'text-warning' : 'text-muted-foreground')}>
                  {product.quantity} on hand
                </span>
              </button>
            </li>
          ))}
          {!isFetching && data?.items.length === 0 && <li className="px-2 py-3 text-[13px] text-muted-foreground">No products match “{search}”.</li>}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
