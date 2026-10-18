import { LayersIcon, PencilIcon, PlusIcon, Trash2Icon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'

import { Panel } from '@/components/common/Panel'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { InlineAlert } from '@/components/feedback/InlineAlert'
import { QueryError } from '@/components/feedback/QueryError'
import { Page, PageHeader } from '@/components/layout/Page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsAdmin } from '@/features/auth'
import { isApiError } from '@/lib/api-client'
import { formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Category } from '@/types/models'

import { useCategories, useCreateCategory, useDeleteCategory, useRenameCategory } from '../api/queries'

interface Row {
  category: Category
  level: 1 | 2
  children: Category[]
  /** Products in this category plus its subcategories. */
  total: number
}

function buildRows(categories: Category[]): Row[] {
  const tops = categories.filter((c) => c.parent_id === null).sort((a, b) => a.name.localeCompare(b.name))
  return tops.flatMap((top) => {
    const children = categories.filter((c) => c.parent_id === top.id).sort((a, b) => a.name.localeCompare(b.name))
    const total = top.product_count + children.reduce((sum, c) => sum + c.product_count, 0)
    return [
      { category: top, level: 1 as const, children, total },
      ...children.map((c) => ({ category: c, level: 2 as const, children: [], total: c.product_count })),
    ]
  })
}

function blockedReason(row: Row): string {
  if (row.category.product_count > 0) {
    return `${row.category.product_count} products are assigned to ${row.category.name}. Move them to another category or deactivate them, then try again.`
  }
  return `Its subcategories (${row.children.map((c) => c.name).join(', ')}) hold ${row.total} products. Empty them first.`
}

export function CategoriesPage() {
  const isAdmin = useIsAdmin()
  const { data: categories, isPending, isError, error, refetch } = useCategories()
  const create = useCreateCategory()
  const rename = useRenameCategory()
  const remove = useDeleteCategory()

  const [newName, setNewName] = useState('')
  const [newParent, setNewParent] = useState('')
  const [newError, setNewError] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null)
  const [blocked, setBlocked] = useState<{ category: Category; reason: string } | null>(null)
  const [toDelete, setToDelete] = useState<Category | null>(null)

  const rows = buildRows(categories ?? [])
  const topCount = rows.filter((r) => r.level === 1).length

  const add = (event: FormEvent) => {
    event.preventDefault()
    const name = newName.trim()
    if (!name) return setNewError('Enter a name for the category.')
    create.mutate(
      { name, parent_id: newParent ? Number(newParent) : null },
      {
        onSuccess: (category) => {
          setNewName('')
          setNewError(null)
          toast.success('Category added', { description: category.name })
        },
        onError: (e) => setNewError(e.message),
      },
    )
  }

  const saveRename = () => {
    if (!editing?.name.trim()) return
    rename.mutate(
      { id: editing.id, name: editing.name.trim() },
      {
        onSuccess: (category) => {
          setEditing(null)
          toast.success('Category renamed', { description: category.name })
        },
        onError: (e) => toast.error('Couldn’t rename category', { description: e.message }),
      },
    )
  }

  const askDelete = (row: Row) => {
    // CAT-3: the backend refuses too; checking here explains it before the user confirms.
    if (row.total > 0) setBlocked({ category: row.category, reason: blockedReason(row) })
    else {
      setBlocked(null)
      setToDelete(row.category)
    }
  }

  const confirmDelete = () => {
    if (!toDelete) return
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        toast.success('Category deleted', { description: toDelete.name })
        setToDelete(null)
      },
      onError: (e) => {
        setToDelete(null)
        if (isApiError(e, 'CATEGORY_NOT_EMPTY')) setBlocked({ category: toDelete, reason: e.message })
        else toast.error('Couldn’t delete category', { description: e.message })
      },
    })
  }

  return (
    <Page width="md">
      <PageHeader title="Categories" description={`${topCount} categories, ${rows.length - topCount} subcategories · one level of subcategories`} />

      {!isAdmin && <InlineAlert tone="muted">View only. Categories are managed by an admin.</InlineAlert>}

      {blocked && (
        <InlineAlert tone="error" title={`Can’t delete “${blocked.category.name}”`} onDismiss={() => setBlocked(null)}>
          <span className="flex flex-col gap-1">
            {blocked.reason}
            <Link to={`/products?category=${blocked.category.id}`} className="font-medium text-primary-soft-foreground hover:text-primary">
              View its products →
            </Link>
          </span>
        </InlineAlert>
      )}

      <Panel className="overflow-hidden">
        {isAdmin && (
          <form onSubmit={add} className="flex flex-wrap items-center gap-2 border-b bg-subtle px-4 py-3.5">
            <label className="flex flex-[1_1_220px]">
              <span className="sr-only">New category name</span>
              <Input
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value)
                  setNewError(null)
                }}
                placeholder="New category name"
                aria-invalid={!!newError}
              />
            </label>
            <NativeSelect aria-label="Parent" className="min-w-[200px]" value={newParent} onChange={(e) => setNewParent(e.target.value)}>
              <NativeSelectOption value="">No parent (top level)</NativeSelectOption>
              {rows
                .filter((r) => r.level === 1)
                .map((r) => (
                  <NativeSelectOption key={r.category.id} value={r.category.id}>
                    Inside {r.category.name}
                  </NativeSelectOption>
                ))}
            </NativeSelect>
            <Button type="submit" disabled={create.isPending}>
              <PlusIcon />
              Add category
            </Button>
            {newError && <span className="basis-full text-xs text-danger">{newError}</span>}
          </form>
        )}

        <div className="grid h-9 grid-cols-[minmax(0,1fr)_110px_120px] items-center gap-3 border-b px-4 text-xs font-medium text-muted-foreground">
          <span>Name</span>
          <span className="text-right">Products</span>
          <span />
        </div>

        {isError ? (
          <QueryError error={error} onRetry={() => refetch()} />
        ) : isPending ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState icon={LayersIcon} title="No categories yet" description="Add one above to start organising products." />
        ) : (
          <ul aria-label="Categories">
            {rows.map((row) => {
              const isEditing = editing?.id === row.category.id
              return (
                <li
                  key={row.category.id}
                  className={cn(
                    'grid min-h-12 grid-cols-[minmax(0,1fr)_110px_120px] items-center gap-3 border-b px-4 last:border-b-0',
                    isEditing && 'bg-subtle',
                  )}
                >
                  <div className={cn('flex min-w-0 items-center gap-2', row.level === 2 && 'pl-2.5')}>
                    {row.level === 2 && <span aria-hidden="true" className="-mt-2.5 h-4 w-3 shrink-0 rounded-bl border-b border-l border-border-strong" />}
                    {isEditing ? (
                      <label className="flex flex-1">
                        <span className="sr-only">Category name</span>
                        <Input
                          autoFocus
                          className="h-8"
                          value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename()
                            if (e.key === 'Escape') setEditing(null)
                          }}
                        />
                      </label>
                    ) : (
                      <>
                        <span className={cn('truncate', row.level === 1 && 'font-medium')}>{row.category.name}</span>
                        {row.children.length > 0 && (
                          <span className="text-xs whitespace-nowrap text-muted-foreground">{row.children.length} subcategories</span>
                        )}
                      </>
                    )}
                  </div>
                  <span className={cn('text-right', row.total === 0 && 'text-muted-foreground')}>{row.total === 0 ? 'Empty' : formatNumber(row.total)}</span>
                  <div className="flex justify-end gap-0.5">
                    {isEditing ? (
                      <>
                        <Button size="sm" onClick={saveRename} disabled={rename.isPending}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                            title="Rename"
                            aria-label={`Rename ${row.category.name}`}
                            onClick={() => setEditing({ id: row.category.id, name: row.category.name })}
                          >
                            <PencilIcon className="size-[15px]" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="text-muted-foreground"
                            title="Delete"
                            aria-label={`Delete ${row.category.name}`}
                            onClick={() => askDelete(row)}
                          >
                            <Trash2Icon className="size-[15px]" />
                          </Button>
                        </>
                      )
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>
      <p className="text-xs text-muted-foreground">A category can only be deleted when no products are assigned to it or its subcategories.</p>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(open) => !open && setToDelete(null)}
        title={`Delete “${toDelete?.name}”?`}
        description="It has no products, so it can be removed. This can’t be undone."
        confirmLabel="Delete category"
        onConfirm={confirmDelete}
        pending={remove.isPending}
      />
    </Page>
  )
}
