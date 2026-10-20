/** The signed-in app shell: sidebar, top bar and the current page. */
import { MenuIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet } from 'react-router'

import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { STORAGE_KEYS } from '@/config/constants'
import { readStorage, writeStorage } from '@/lib/storage'
import { cn } from '@/lib/utils'

import { GlobalSearch } from './GlobalSearch'
import { SidebarNav } from './SidebarNav'
import { UserMenu } from './UserMenu'

/** Authenticated shell: sidebar (drawer under 860px), top bar, routed page. */
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => readStorage(STORAGE_KEYS.sidebarCollapsed) === 'true')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      writeStorage(STORAGE_KEYS.sidebarCollapsed, String(!value))
      return !value
    })
  }

  return (
    <div className="flex min-h-svh bg-background">
      <aside
        className={cn(
          'sticky top-0 hidden h-svh shrink-0 overflow-y-auto border-r border-sidebar-border bg-sidebar md:block',
          collapsed ? 'w-[57px]' : 'w-[232px]',
        )}
      >
        <SidebarNav collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-[280px] gap-0 bg-card p-0 sm:max-w-[280px]">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation</SheetDescription>
          <SidebarNav collapsed={false} onClose={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2.5 border-b bg-background px-4 md:px-5">
          <Button variant="outline" size="icon" className="text-subtle-foreground md:hidden" aria-label="Open menu" onClick={() => setDrawerOpen(true)}>
            <MenuIcon />
          </Button>
          <GlobalSearch />
          <div className="hidden flex-1 md:block" />
          <Button asChild aria-label="New invoice" className="max-md:size-9 max-md:px-0">
            <Link to="/invoices/new">
              <PlusIcon />
              <span className="hidden md:inline">New invoice</span>
            </Link>
          </Button>
          <ThemeToggle />
          <UserMenu />
        </header>
        <main className="flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
