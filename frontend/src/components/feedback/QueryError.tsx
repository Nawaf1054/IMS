/** Error state for a failed data load, with a retry button. */
import { CloudOffIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { EmptyState } from './EmptyState'

/** Fallback for a section whose data failed to load. */
export function QueryError({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const message = error instanceof Error ? error.message : 'Something went wrong while loading this.'
  return (
    <EmptyState
      icon={CloudOffIcon}
      title="Couldn’t load this"
      description={message}
      className={className}
      action={
        onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )
      }
    />
  )
}
