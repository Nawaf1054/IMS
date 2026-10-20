/** The sidebar's link lists: one for everyone and one for admins. */
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

/** One sidebar link. */
export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** Shows the low-stock count badge. */
  lowStockBadge?: boolean
  end?: boolean
}

/** Links every signed-in user sees. */
export const MAIN_NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon, end: true },
  { to: '/products', label: 'Products', icon: PackageIcon, lowStockBadge: true },
  { to: '/categories', label: 'Categories', icon: LayersIcon },
  { to: '/stock', label: 'Stock', icon: ArrowLeftRightIcon },
  { to: '/invoices', label: 'Invoices', icon: ReceiptTextIcon },
  { to: '/assistant', label: 'Assistant', icon: SparklesIcon },
]

/** Links only admins see. */
export const ADMIN_NAV: NavItem[] = [
  { to: '/users', label: 'Users', icon: UsersIcon },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontalIcon },
]
