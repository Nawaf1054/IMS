import { TriangleAlertIcon } from 'lucide-react'
import { useRouteError } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { Button } from '@/components/ui/button'

/** Last-resort boundary for errors thrown while rendering a route. */
export function RouteErrorPage() {
  const error = useRouteError()
  console.error(error)
  return (
    <div className="flex min-h-svh items-center justify-center bg-subtle p-4">
      <EmptyState
        bordered
        className="w-full max-w-md bg-card"
        icon={TriangleAlertIcon}
        title="Something went wrong"
        description="This page hit an unexpected error. Reloading usually fixes it; your saved data is safe."
        action={<Button onClick={() => window.location.reload()}>Reload</Button>}
      />
    </div>
  )
}
