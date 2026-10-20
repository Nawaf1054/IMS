/** Supabase Auth implementation of the app's session: sign-in, sign-out, tokens and refresh. */
import type { AuthError, SupabaseClient } from '@supabase/supabase-js'

import { STORAGE_KEYS } from '@/config/constants'

import { ApiError, networkError } from '../api-error'
import { readStorage } from '../storage'
import type { AuthSession } from './types'

/** Maps Supabase Auth errors to the codes and messages the UI already handles. */
export function toSignInError(error: Pick<AuthError, 'code' | 'status' | 'message' | 'name'>): ApiError {
  switch (error.code) {
    case 'invalid_credentials':
      return new ApiError(401, { detail: 'Incorrect email or password.', code: 'INVALID_CREDENTIALS' })
    case 'user_banned':
      return new ApiError(403, {
        detail: 'This account has been deactivated. Ask an admin to reactivate it.',
        code: 'ACCOUNT_INACTIVE',
      })
    case 'over_request_rate_limit':
      return new ApiError(429, { detail: 'Too many sign-in attempts. Wait a minute and try again.', code: 'RATE_LIMITED' })
  }
  if (error.name === 'AuthRetryableFetchError' || !error.status) return networkError()
  return new ApiError(error.status, { detail: error.message || 'Couldn’t sign in. Try again.', code: 'AUTH_ERROR' })
}

/** Sessions issued by Supabase Auth. The client (and its bundle) loads on first use. */
export function createSupabaseSession(url: string, publishableKey: string): AuthSession {
  let clientPromise: Promise<SupabaseClient> | null = null
  const client = () =>
    (clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url, publishableKey, {
        auth: {
          storageKey: STORAGE_KEYS.supabaseSession,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      }),
    ))

  return {
    hasStoredSession: () => readStorage(STORAGE_KEYS.supabaseSession) !== null,

    async signIn(email, password) {
      const { error } = await (await client()).auth.signInWithPassword({ email, password })
      if (error) throw toSignInError(error)
    },

    async signOut() {
      // Local only: an expired or revoked session can't be signed out on the server anyway.
      await (await client()).auth.signOut({ scope: 'local' })
    },

    async getAccessToken() {
      const { data } = await (await client()).auth.getSession()
      return data.session?.access_token ?? null
    },

    async refresh() {
      const { data, error } = await (await client()).auth.refreshSession()
      return !error && data.session !== null
    },
  }
}
