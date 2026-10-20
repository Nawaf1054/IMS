/** The IMS logo mark. */
import { PackageIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

const SIZES = {
  sm: { box: 'size-[26px] rounded-[7px]', icon: 'size-[15px]' },
  md: { box: 'size-10 rounded-lg', icon: 'size-[22px]' },
  lg: { box: 'size-11 rounded-[10px]', icon: 'size-6' },
}

/** Indigo tile with the package mark. */
export function AppLogo({ size = 'sm', className }: { size?: keyof typeof SIZES; className?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center bg-primary text-white', SIZES[size].box, className)}>
      <PackageIcon className={SIZES[size].icon} strokeWidth={2.2} aria-hidden="true" />
    </span>
  )
}
