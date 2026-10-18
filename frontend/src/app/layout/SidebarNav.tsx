import { PanelLeftIcon, XIcon } from 'lucide-react'
import { NavLink } from 'react-router'

import { AppLogo } from '@/components/layout/AppLogo'
import { useIsAdmin } from '@/features/auth'
import { useLowStockCount } from '@/features/products'
import { useSettings } from '@/features/settings'
import { cn } from '@/lib/utils'

import { ADMIN_NAV, MAIN_NAV, type NavItem } from './nav-items'

interface SidebarNavProps {
  collapsed: boolean
  onToggleCollapsed?: () => void
  /** Mobile drawer: shows a close button and closes on navigation. */
  onClose?: () => void
}

function NavEntry({ item, collapsed, lowStock, onNavigate }: { item: NavItem; collapsed: boolean; lowStock?: number; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 font-medium transition-colors',
          isActive ? 'bg-primary-soft text-primary-soft-foreground' : 'text-subtle-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.lowStockBadge && !!lowStock && (
        <span
          title={`${lowStock} low-stock products`}
          className="h-[18px] rounded-full bg-warning-soft px-1.5 text-[11px] leading-[18px] font-semibold text-warning"
        >
          {lowStock}
        </span>
      )}
      {collapsed && <span className="sr-only">{item.label}</span>}
    </NavLink>
  )
}

/** Sidebar contents, shared by the desktop rail and the mobile drawer. */
export function SidebarNav({ collapsed, onToggleCollapsed, onClose }: SidebarNavProps) {
  const isAdmin = useIsAdmin()
  const { data: lowStock } = useLowStockCount()
  const { data: settings } = useSettings()

  return (
    <nav aria-label="Main navigation" className="flex h-full flex-col gap-0.5 px-2.5 py-3">
      <div className="mb-2.5 flex h-10 items-center gap-2.5 px-[5px]">
        <AppLogo />
        {!collapsed && (
          <span className="flex min-w-0 flex-1 flex-col leading-[15px]">
            <strong className="text-[15px] font-bold tracking-[-0.01em] text-foreground">IMS</strong>
            <span className="truncate text-[11px] text-muted-foreground">{settings?.business_name ?? 'Inventory management'}</span>
          </span>
        )}
        {onClose && (
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-lg text-subtle-foreground hover:bg-muted"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      {MAIN_NAV.map((item) => (
        <NavEntry key={item.to} item={item} collapsed={collapsed} lowStock={lowStock} onNavigate={onClose} />
      ))}

      <div className="min-h-6 flex-1" />

      {isAdmin && (
        <>
          {!collapsed && <span className="text-eyebrow px-2.5 pb-1 text-muted-foreground">Admin</span>}
          {ADMIN_NAV.map((item) => (
            <NavEntry key={item.to} item={item} collapsed={collapsed} onNavigate={onClose} />
          ))}
        </>
      )}

      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="mt-1.5 flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-left font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <PanelLeftIcon className="size-4 shrink-0" strokeWidth={1.8} aria-hidden="true" />
          {!collapsed && <span>Collapse</span>}
        </button>
      )}
    </nav>
  )
}
