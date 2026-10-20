/** Hooks for reading the sign-in state, the current user and their role. */
import { useContext } from 'react'

import type { User } from '@/types/models'

import { AuthContext, type AuthContextValue } from '../components/auth-context'

/** The sign-in state and the login / logout functions. Must be used inside AuthProvider. */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** The signed-in user. Only call inside routes guarded by RequireAuth. */
export function useCurrentUser(): User {
  const { user } = useAuth()
  if (!user) throw new Error('useCurrentUser called without a signed-in user')
  return user
}

/** UI hint only: the backend enforces roles on every request (AUTH-4). */
export function useIsAdmin(): boolean {
  return useAuth().user?.role === 'admin'
}
