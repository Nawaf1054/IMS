import { SearchInput } from '@/components/common/SearchInput'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { categoryOptions, useCategories } from '@/features/categories'
import { cn } from '@/lib/utils'

import type { ProductFilters as Filters } from '../hooks/use-product-filters'

interface ProductFiltersProps {
  filters: Filters
  searchDraft: string
  onSearchChange: (value: string) => void
  onChange: (patch: Partial<Filters>) => void
  onClear: () => void
  isFiltered: boolean
}

export function ProductFilters({ filters, searchDraft, onSearchChange, onChange, onClear, isFiltered }: ProductFiltersProps) {
  const { data: categories } = useCategories()

  return (
    <div role="search" className="flex flex-wrap items-center gap-2">
      <SearchInput
        label="Filter by name or SKU"
        placeholder="Filter by name or SKU"
        className="max-w-[360px] flex-[1_1_260px]"
        value={searchDraft}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <NativeSelect
        aria-label="Category"
        className="min-w-[180px]"
        value={filters.categoryId ?? ''}
        onChange={(e) => onChange({ categoryId: Number(e.target.value) || null })}
      >
        <NativeSelectOption value="">All categories</NativeSelectOption>
        {categoryOptions(categories).map((option) => (
          <NativeSelectOption key={option.id} value={option.id}>
            {option.isChild ? `— ${option.label.split(' › ')[1]}` : option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <label
        className={cn(
          'flex h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 font-medium transition-colors',
          filters.lowOnly ? 'border-warning-line bg-warning-soft text-warning' : 'bg-card',
        )}
      >
        <Switch size="sm" checked={filters.lowOnly} onCheckedChange={(lowOnly) => onChange({ lowOnly })} className="data-checked:bg-warning" />
        Low stock only
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-subtle-foreground">
        <Checkbox checked={filters.showInactive} onCheckedChange={(checked) => onChange({ showInactive: checked === true })} />
        Show inactive
      </label>
      {isFiltered && (
        <Button variant="ghost" className="text-muted-foreground" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </div>
  )
}
