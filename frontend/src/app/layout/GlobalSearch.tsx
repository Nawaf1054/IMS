/** Quick product search in the top bar. */
import { SearchIcon } from 'lucide-react'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { useProducts } from '@/features/products'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'

/** Top-bar product search by name or SKU; Ctrl/⌘ K focuses it. */
export function GlobalSearch() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const term = useDebouncedValue(query.trim(), 200)
  const { data, isFetching } = useProducts({ search: term, page_size: 5, include_inactive: true }, { enabled: term.length > 0 })
  const results = term ? (data?.items ?? []) : []
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent)

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') close()
    if (event.key === 'Enter' && results[0]) {
      navigate(`/products/${results[0].id}`)
      close()
    }
  }

  return (
    <div
      className="relative min-w-0 flex-1 md:max-w-[440px]"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
    >
      <label className="relative flex items-center">
        <span className="sr-only">Search products by name or SKU</span>
        <SearchIcon className="pointer-events-none absolute left-[11px] size-4 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search products by name or SKU"
          className="h-9 w-full rounded-lg border bg-subtle pr-11 pl-[34px] text-sm outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-3 focus:ring-primary/25"
        />
        <kbd className="pointer-events-none absolute right-2 hidden rounded border bg-card px-[5px] font-sans text-[11px] leading-[18px] text-muted-foreground md:block">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </label>

      {open && term && (
        <div className="absolute inset-x-0 top-[42px] z-20 rounded-lg border bg-card p-1.5 shadow-overlay">
          <div className="text-eyebrow px-2 py-1.5 text-muted-foreground">Products</div>
          {results.map((product) => (
            <Link
              key={product.id}
              to={`/products/${product.id}`}
              onClick={close}
              className="flex items-center gap-2.5 rounded-md p-2 text-foreground hover:bg-muted focus-visible:bg-muted"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{product.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{product.sku}</span>
              </span>
              <span
                className={cn(
                  'text-xs whitespace-nowrap',
                  product.quantity === 0 ? 'text-danger' : product.is_low_stock ? 'text-warning' : 'text-muted-foreground',
                )}
              >
                {product.quantity} in stock
              </span>
            </Link>
          ))}
          {!isFetching && results.length === 0 && <div className="px-2 py-3.5 text-[13px] text-muted-foreground">No products match “{term}”.</div>}
        </div>
      )}
    </div>
  )
}
