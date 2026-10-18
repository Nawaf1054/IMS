import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { z } from 'zod'

import { FormField } from '@/components/common/FormField'
import { InlineAlert } from '@/components/feedback/InlineAlert'
import { AppLogo } from '@/components/layout/AppLogo'
import { ThemeToggle } from '@/components/layout/ThemeToggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { APP_VERSION } from '@/config/constants'
import { isApiError } from '@/lib/api-client'

import { useAuth } from '../hooks/use-auth'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const schema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .refine((v) => EMAIL.test(v), 'Enter a valid email address, like name@company.com.'),
  password: z.string().min(1, 'Password is required.'),
})

type LoginValues = z.infer<typeof schema>

export function LoginPage() {
  const { status, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showReset, setShowReset] = useState(false)
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  if (status === 'authenticated') return <Navigate to={from} replace />

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null)
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (error) {
      setServerError(
        isApiError(error, 'INVALID_CREDENTIALS')
          ? 'Incorrect email or password. Check your details and try again.'
          : error instanceof Error
            ? error.message
            : 'Couldn’t sign in. Try again.',
      )
    }
  })

  return (
    <div className="flex min-h-svh flex-col bg-subtle">
      <div className="flex justify-end px-5 py-4">
        <ThemeToggle />
      </div>
      <main className="flex flex-1 items-center justify-center px-4 pt-6 pb-16">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div className="flex flex-col items-center gap-3.5 text-center">
            <AppLogo size="lg" />
            <div>
              <h1 className="text-page-title">Sign in to IMS</h1>
              <p className="mt-1 text-muted-foreground">Inventory &amp; sales management</p>
            </div>
          </div>

          <form noValidate onSubmit={onSubmit} className="flex flex-col gap-[18px] rounded-xl border bg-card p-7">
            {serverError && <InlineAlert tone="error">{serverError}</InlineAlert>}

            <FormField label="Email" error={errors.email?.message}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  className="h-10"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  {...register('email')}
                />
              )}
            </FormField>

            <FormField
              label="Password"
              error={errors.password?.message}
              help={showReset ? 'Passwords are reset by an administrator. Ask an admin on your team.' : undefined}
              labelAction={
                <button type="button" onClick={() => setShowReset(true)} className="text-xs text-primary-soft-foreground hover:text-primary">
                  Forgot password?
                </button>
              }
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-10"
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  {...register('password')}
                />
              )}
            </FormField>

            <Button type="submit" className="h-10" disabled={isSubmitting}>
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Accounts are created by an administrator.</p>
          </form>
          <p className="text-center text-xs text-muted-foreground">IMS v{APP_VERSION}</p>
        </div>
      </main>
    </div>
  )
}
