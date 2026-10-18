import { SearchIcon } from 'lucide-react'
import type { ComponentProps } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface SearchInputProps extends Omit<ComponentProps<'input'>, 'type'> {
  /** Visible to screen readers only; the placeholder carries the hint visually. */
  label: string
  inputClassName?: string
}

export function SearchInput({ label, className, inputClassName, ...props }: SearchInputProps) {
  return (
    <label className={cn('relative flex items-center', className)}>
      <span className="sr-only">{label}</span>
      <SearchIcon className="pointer-events-none absolute left-[11px] size-4 text-muted-foreground" aria-hidden="true" />
      <Input type="search" className={cn('pl-[34px]', inputClassName)} {...props} />
    </label>
  )
}
