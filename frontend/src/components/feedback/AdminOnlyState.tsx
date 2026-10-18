import { LockIcon } from 'lucide-react'
import { Link } from 'react-router'

import { EmptyState } from './EmptyState'

/** Shown to staff who reach an admin page (the backend refuses the data anyway, AUTH-4). */
export function AdminOnlyState({ subject }: { subject: string }) {
  return (
    <EmptyState
      bordered
      icon={LockIcon}
      title={<span className="text-base">Admins only</span>}
      description={`${subject} are managed by an administrator. If you need a change, ask an admin on your team.`}
      action={
        <Link to="/" className="text-[13px] font-medium text-primary-soft-foreground hover:text-primary">
          Back to dashboard
        </Link>
      }
    />
  )
}
