/** The React context that carries the sign-in state (provided by AuthProvider). */
import { createContext } from 'react'

import type { User } from '@/types/models'

/** `loading` while a stored session is being checked, then signed in or not. */
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

/** What useAuth() returns. */
export interface AuthContextValue {
  status: AuthStatus
  user: User | null
  /** Signs in with email and password and loads the profile; throws ApiError on failure. */
  login: (email: string, password: string) => Promise<User>
  /** Signs out and clears cached data. */
  logout: () => void
}

/** The context object; read it through useAuth(). */
export const AuthContext = createContext<AuthContextValue | null>(null)
