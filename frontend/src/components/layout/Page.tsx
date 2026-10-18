import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { cn } from '@/lib/utils'

/** Page body: 24/32px padding (16px on phones) and an optional max width. */
export function Page({ children, className, width = 'full' }: { children: ReactNode; className?: string; width?: 'full' | 'xl' | 'lg' | 'md' }) {
  const widths = { full: '', xl: 'max-w-[1240px]', lg: 'max-w-[1180px]', md: 'max-w-[980px]' }
  return <div className={cn('flex w-full flex-col gap-4 p-4 md:px-8 md:pt-6 md:pb-12', widths[width], className)}>{children}</div>
}

export interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  breadcrumbs?: Crumb[]
  /** Extra content beside the title (status chips). */
  meta?: ReactNode
  className?: string
}

export function PageHeader({ title, description, actions, breadcrumbs, meta, className }: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">/</span>}
              {crumb.to ? (
                <Link to={crumb.to} className="text-primary-soft-foreground hover:text-primary">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-subtle-foreground" aria-current="page">
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-page-title">{title}</h1>
            {meta}
          </div>
          {description && <div className="text-[13px] text-muted-foreground">{description}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}
