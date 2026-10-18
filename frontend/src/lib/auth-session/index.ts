import { env } from '@/config/env'

import { createMockSession } from './mock-session'
import { createSupabaseSession } from './supabase-session'
import type { AuthSession } from './types'

export type { AuthSession } from './types'

function createAuthSession(): AuthSession {
  if (env.useMocks) return createMockSession()
  if (!env.supabaseUrl || !env.supabasePublishableKey) {
    throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or VITE_USE_MOCKS=true.')
  }
  return createSupabaseSession(env.supabaseUrl, env.supabasePublishableKey)
}

/** The app's single session: mock API tokens or Supabase Auth, depending on VITE_USE_MOCKS. */
export const authSession = createAuthSession()
