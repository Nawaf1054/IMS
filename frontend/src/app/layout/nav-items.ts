import {
  ArrowLeftRightIcon,
  LayersIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  PackageIcon,
  ReceiptTextIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  UsersIcon,
} from 'lucide-react'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shows the low-stock count badge. */
  lowStockBadge?: boolean
  end?: boolean
}

export const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon, end: true },
  { to: '/products', label: 'Products', icon: PackageIcon, lowStockBadge: true },
  { to: '/categories', label: 'Categories', icon: LayersIcon },
  { to: '/stock', label: 'Stock', icon: ArrowLeftRightIcon },
  { to: '/invoices', label: 'Invoices', icon: ReceiptTextIcon },
  { to: '/assistant', label: 'Assistant', icon: SparklesIcon },
]

export const ADMIN_NAV: NavItem[] = [
  { to: '/users', label: 'Users', icon: UsersIcon },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontalIcon },
]
