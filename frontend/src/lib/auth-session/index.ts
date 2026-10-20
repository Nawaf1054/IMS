/** The app's single sign-in session, backed by Supabase Auth. */
import { env } from '@/config/env'

import { createSupabaseSession } from './supabase-session'
import type { AuthSession } from './types'

export type { AuthSession } from './types'

/** Builds the Supabase session, failing fast with a clear message if the env vars are missing. */
function createAuthSession(): AuthSession {
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.')
  }
  return createSupabaseSession(env.supabaseUrl, env.supabasePublishableKey)
}

export const authSession = createAuthSession()
