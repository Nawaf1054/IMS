import { SearchIcon } from 'lucide-react'
import { useState } from 'react'

import { Panel } from '@/components/common/Panel'
import { Skeleton } from '@/components/ui/skeleton'
import { useProducts } from '@/features/products'
import { useMoney } from '@/features/settings'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import type { Product } from '@/types/models'

/** Search box plus product tiles; tapping a tile adds it to the invoice. */
export function ProductSuggestions({ onAdd }: { onAdd: (product: Product) => void }) {
  const money = useMoney()
  const [query, setQuery] = useState('')
  const term = useDebouncedValue(query.trim(), 200)
  const { data, isPending } = useProducts({ search: term || undefined, page_size: 6 })

  return (
    <Panel aria-label="Add products" className="flex flex-col gap-2.5 p-4">
      <label className="relative flex items-center">
        <span className="sr-only">Add product by name or SKU</span>
        <SearchIcon className="pointer-events-none absolute left-[13px] size-[18px] text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            const first = data?.items.find((p) => p.quantity > 0)
            if (e.key === 'Enter' && first) {
              e.preventDefault()
              onAdd(first)
              setQuery('')
            }
          }}
          placeholder="Add product by name or SKU"
          className="h-11 w-full rounded-lg border bg-subtle pr-3.5 pl-10 text-[15px] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/25"
        />
      </label>
      <span className="px-1 pt-0.5 text-xs text-muted-foreground">{term ? `${data?.total ?? 0} matching products` : 'Products'}</span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
        {isPending || !data
          ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[58px] rounded-lg" />)
          : data.items.map((product) => {
              const out = product.quantity === 0
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={out}
                  onClick={() => {
                    onAdd(product)
                    setQuery('')
                  }}
                  className="flex flex-col items-start gap-0.5 rounded-lg border bg-card px-3 py-2.5 text-left transition-colors hover:border-border-strong hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className="text-[13px] leading-[18px] font-medium">{product.name}</span>
                  <span className="flex w-full justify-between text-xs text-muted-foreground">
                    <span>{money(product.sell_price)}</span>
                    <span className={cn(out ? 'text-danger' : product.is_low_stock && 'text-warning')}>
                      {out ? 'Out of stock' : `${product.quantity} in stock`}
                    </span>
                  </span>
                </button>
              )
            })}
      </div>
    </Panel>
  )
}
