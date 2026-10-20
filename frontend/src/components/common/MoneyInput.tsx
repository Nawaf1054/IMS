/** Text input for amounts, with the currency code shown inside the field. */
import type { ComponentProps } from 'react'

import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface MoneyInputProps extends Omit<ComponentProps<'input'>, 'type' | 'inputMode'> {
  currency: string
}

/** Right-aligned amount with the currency code inside the field. */
export function MoneyInput({ currency, className, ...props }: MoneyInputProps) {
  return (
    <span className="relative flex items-center">
      <span aria-hidden="true" className="pointer-events-none absolute left-3 text-[13px] text-muted-foreground">
        {currency}
      </span>
      <Input type="text" inputMode="decimal" className={cn('pl-[46px] text-right', className)} {...props} />
    </span>
  )
}
