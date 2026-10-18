import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'

import { AdminOnlyState } from '@/components/feedback/AdminOnlyState'
import { AppLogo } from '@/components/layout/AppLogo'
import { Page } from '@/components/layout/Page'
import { useAuth } from '@/features/auth'

/** Every route except /login needs a session (AUTH-3). */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div className="flex min-h-svh items-center justify-center bg-subtle" aria-busy="true" aria-label="Loading">
        <AppLogo size="lg" className="animate-pulse" />
      </div>
    )
  }
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return <Outlet />
}

/**
 * Admin-only pages. Hiding them is a convenience; the backend rejects staff
 * requests regardless (AUTH-4).
 */
export function RequireAdmin({ subject, children }: { subject: string; children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') {
    return (
      <Page width="lg">
        <AdminOnlyState subject={subject} />
      </Page>
    )
  }
  return children
}
