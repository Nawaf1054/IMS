/** /users (admin): user list with roles and status; add, edit, deactivate and reactivate. */
import { PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { RoleBadge } from '@/components/common/badges'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useCurrentUser } from '@/features/auth'
import { formatRelativeDateTime, initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { User } from '@/types/models'

import { useUpdateUser, useUsers } from '../api/queries'
import { UserDialog } from '../components/UserDialog'

/** User management. Deactivating asks for confirmation; you can't deactivate yourself. */
export function UsersPage() {
  const me = useCurrentUser()
  const { data: users, isPending, isError, error, refetch } = useUsers()
  const updateUser = useUpdateUser()
  const [dialog, setDialog] = useState<User | 'new' | null>(null)
  const [toDeactivate, setToDeactivate] = useState<User | null>(null)
  const active = users?.filter((u) => u.is_active).length ?? 0

  const setActive = (user: User, isActive: boolean) =>
    updateUser.mutate(
      { id: user.id, input: { is_active: isActive } },
      {
        onSuccess: () => {
          setToDeactivate(null)
          toast.success(isActive ? 'User reactivated' : 'User deactivated', { description: isActive ? user.name : `${user.name} has been signed out` })
        },
        onError: (e) => toast.error('Couldn’t update user', { description: e.message }),
      },
    )

  return (
    <Page width="lg">
      <PageHeader
        title="Users"
        description={users ? `${active} active · ${users.length - active} inactive` : 'Team accounts and roles'}
        actions={
          <Button onClick={() => setDialog('new')}>
            <PlusIcon />
            Add user
          </Button>
        }
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : (
          <Table className="min-w-[820px]">
            <TableHeader>
              <TableRow>
                <TableHead className="px-4">Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead className="w-[170px]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isPending
                ? Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className="h-6" />
                      </TableCell>
                    </TableRow>
                  ))
                : users.map((user) => {
                    const isMe = user.id === me.id
                    return (
                      <TableRow key={user.id} className={cn(!user.is_active && 'opacity-60')}>
                        <TableCell className="h-14 px-4">
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className={cn(
                                'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                user.role === 'admin' ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-muted text-subtle-foreground',
                              )}
                            >
                              {initials(user.name)}
                            </span>
                            <span className="font-medium">{user.name}</span>
                            {isMe && <span className="text-[11px] text-muted-foreground">(you)</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-subtle-foreground">{user.email}</TableCell>
                        <TableCell>
                          <RoleBadge role={user.role} />
                        </TableCell>
                        <TableCell>
                          <span className={cn('inline-flex items-center gap-1.5 text-[13px]', !user.is_active && 'text-muted-foreground')}>
                            <span className={cn('size-[7px] rounded-full', user.is_active ? 'bg-success' : 'bg-chart-6')} aria-hidden="true" />
                            {user.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-subtle-foreground">
                          {user.last_active_at ? formatRelativeDateTime(user.last_active_at) : 'Never'}
                        </TableCell>
                        <TableCell className="px-3 text-right whitespace-nowrap">
                          <Button variant="outline" size="sm" onClick={() => setDialog(user)}>
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isMe}
                            title={isMe ? 'You can’t deactivate your own account' : undefined}
                            className={user.is_active ? 'text-danger hover:text-danger' : 'text-primary-soft-foreground'}
                            onClick={() => (user.is_active ? setToDeactivate(user) : setActive(user, true))}
                          >
                            {user.is_active ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
            </TableBody>
          </Table>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Users are deactivated, never deleted, so their invoices and stock movements stay attributed.</p>

      <UserDialog target={dialog} currentUserId={me.id} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={!!toDeactivate}
        onOpenChange={(open) => !open && setToDeactivate(null)}
        title={`Deactivate ${toDeactivate?.name}?`}
        description="They’ll be signed out and won’t be able to sign in. Their invoices and stock movements stay on record. You can reactivate them later."
        confirmLabel="Deactivate"
        onConfirm={() => toDeactivate && setActive(toDeactivate, false)}
        pending={updateUser.isPending}
      />
    </Page>
  )
}
