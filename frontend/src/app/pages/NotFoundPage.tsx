import { CompassIcon } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/feedback/EmptyState'
import { Page } from '@/components/layout/Page'

export function NotFoundPage() {
  return (
    <Page width="lg">
      <EmptyState
        bordered
        icon={CompassIcon}
        title="Page not found"
        description="The link may be broken or the page may have moved."
        action={
          <Link to="/" className="text-[13px] font-medium text-primary-soft-foreground hover:text-primary">
            Back to dashboard
          </Link>
        }
      />
    </Page>
  )
}
