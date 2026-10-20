/** Dialog for creating or editing a user (AUTH-5). */
import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { z } from 'zod'

import { FormField } from '@/components/common/FormField'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { isApiError } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import type { Role, User } from '@/types/models'

import { useCreateUser, useUpdateUser } from '../api/queries'

/** The two roles with a short explanation of each. */
const ROLES: Array<{ value: Role; label: string; help: string }> = [
  { value: 'staff', label: 'Staff', help: 'Products and stock, create and print invoices, dashboard. No deletes, prices or users.' },
  { value: 'admin', label: 'Admin', help: 'Everything, including users, settings, prices, deletes and cancelling invoices.' },
]

/** Loose email shape check; the server has the final say. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Fields shared by create and edit. */
const baseSchema = z.object({
  name: z.string().trim().min(1, 'Enter the person’s name.'),
  email: z
    .string()
    .trim()
    .refine((v) => EMAIL.test(v), 'Enter a valid email address.'),
  role: z.enum(['admin', 'staff']),
  password: z.string(),
})

/** Create also needs an initial password (10+ characters, as the backend requires). */
const createSchema = baseSchema.extend({ password: z.string().min(10, 'Use at least 10 characters.') })

type Values = z.infer<typeof baseSchema>

/** Props for UserDialog. */
interface UserDialogProps {
  /** null: closed · 'new': create · User: edit */
  target: User | 'new' | null
  currentUserId: number
  onClose: () => void
}

/** AUTH-5: admins create users, edit them and assign roles. */
export function UserDialog({ target, currentUserId, onClose }: UserDialogProps) {
  const isCreate = target === 'new'
  const editing = target && target !== 'new' ? target : null

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-[480px]" showCloseButton>
        {target !== null && <UserForm key={editing?.id ?? 'new'} isCreate={isCreate} user={editing} isSelf={editing?.id === currentUserId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

/** The user form. Admins can't change their own role. */
function UserForm({ isCreate, user, isSelf, onClose }: { isCreate: boolean; user: User | null; isSelf: boolean; onClose: () => void }) {
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(isCreate ? createSchema : baseSchema),
    defaultValues: { name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'staff', password: '' },
  })

  const submit = handleSubmit(async (values) => {
    try {
      const saved = isCreate
        ? await createUser.mutateAsync({ name: values.name.trim(), email: values.email.trim(), role: values.role, password: values.password })
        : await updateUser.mutateAsync({ id: user!.id, input: { name: values.name.trim(), email: values.email.trim(), role: values.role } })
      toast.success(isCreate ? 'User created' : 'User updated', { description: `${saved.name} · ${saved.role === 'admin' ? 'Admin' : 'Staff'}` })
      onClose()
    } catch (error) {
      if (isApiError(error, 'EMAIL_TAKEN')) setError('email', { message: error.message })
      else if (isApiError(error, 'WEAK_PASSWORD')) setError('password', { message: error.message })
      else toast.error('Couldn’t save user', { description: error instanceof Error ? error.message : undefined })
    }
  })

  return (
    <form noValidate onSubmit={submit} className="flex flex-col">
      <DialogHeader className="border-b px-[22px] py-[18px]">
        <DialogTitle>{isCreate ? 'Add user' : 'Edit user'}</DialogTitle>
        <DialogDescription className="sr-only">{isCreate ? 'Create an account and choose its role.' : 'Change the name, email or role.'}</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4 px-[22px] py-5">
        <FormField label="Full name" error={errors.name?.message}>
          {(f) => <Input id={f.id} className="h-[38px]" autoComplete="off" aria-invalid={f.invalid} aria-describedby={f.describedBy} {...register('name')} />}
        </FormField>
        <FormField label="Email" error={errors.email?.message}>
          {(f) => (
            <Input
              id={f.id}
              type="email"
              className="h-[38px]"
              autoComplete="off"
              aria-invalid={f.invalid}
              aria-describedby={f.describedBy}
              {...register('email')}
            />
          )}
        </FormField>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <fieldset className="flex flex-col gap-2" disabled={isSelf}>
              <legend className="mb-2 text-[13px] font-medium">
                Role{isSelf && <span className="ml-1.5 font-normal text-muted-foreground">You can’t change your own role</span>}
              </legend>
              <div role="radiogroup" className="flex flex-col gap-2">
                {ROLES.map((role) => {
                  const checked = field.value === role.value
                  return (
                    <button
                      key={role.value}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      onClick={() => field.onChange(role.value)}
                      className={cn(
                        'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60',
                        checked ? 'border-primary bg-primary-soft ring-1 ring-primary' : 'bg-card hover:bg-muted',
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]',
                          checked ? 'border-primary' : 'border-border-strong',
                        )}
                      >
                        <span className={cn('size-2 rounded-full', checked && 'bg-primary')} />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium">{role.label}</span>
                        <span className="text-xs text-muted-foreground">{role.help}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
        />
        {isCreate && (
          <FormField label="Temporary password" error={errors.password?.message} help="At least 10 characters. Share it with the person securely.">
            {(f) => (
              <Input
                id={f.id}
                type="password"
                className="h-[38px]"
                autoComplete="new-password"
                aria-invalid={f.invalid}
                aria-describedby={f.describedBy}
                {...register('password')}
              />
            )}
          </FormField>
        )}
      </div>
      <DialogFooter className="mx-0 mb-0">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : isCreate ? 'Create user' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  )
}
