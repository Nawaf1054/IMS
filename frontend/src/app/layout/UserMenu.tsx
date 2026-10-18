import { LogOutIcon } from 'lucide-react'

import { RoleBadge } from '@/components/common/badges'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth, useCurrentUser } from '@/features/auth'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'

export function UserMenu() {
  const user = useCurrentUser()
  const { logout } = useAuth()
  const isAdmin = user.role === 'admin'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex shrink-0 items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-0.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-primary/25">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-8 items-center justify-center rounded-full text-xs font-semibold',
            isAdmin ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-muted text-subtle-foreground',
          )}
        >
          {initials(user.name)}
        </span>
        <span className="hidden flex-col gap-0.5 leading-4 md:flex">
          <span className="text-[13px] font-medium whitespace-nowrap">{user.name}</span>
          <span className="self-start [&>span]:h-4 [&>span]:px-1.5 [&>span]:text-[10px]">
            <RoleBadge role={user.role} />
          </span>
        </span>
        <span className="sr-only md:hidden">Account menu for {user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5 font-normal">
          <span className="font-medium text-foreground">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
