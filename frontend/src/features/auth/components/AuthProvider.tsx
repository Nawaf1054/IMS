import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'

import { AUTH_EXPIRED_EVENT } from '@/lib/api-client'
import { authStorage } from '@/lib/auth-storage'
import type { User } from '@/types/models'

import { authApi } from '../api/auth.api'
import { AuthContext, type AuthStatus } from './auth-context'

/** Restores the session on load and exposes the signed-in user and their role. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() => (authStorage.getAccessToken() ? 'loading' : 'anonymous'))

  const logout = useCallback(() => {
    authStorage.clear()
    queryClient.clear()
    setUser(null)
    setStatus('anonymous')
  }, [queryClient])

  useEffect(() => {
    if (status !== 'loading') return
    authApi
      .me()
      .then((me) => {
        setUser(me)
        setStatus('authenticated')
      })
      .catch(logout)
  }, [status, logout])

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, logout)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, logout)
  }, [logout])

  const login = useCallback(async (email: string, password: string) => {
    const response = await authApi.login(email, password)
    authStorage.setTokens(response)
    setUser(response.user)
    setStatus('authenticated')
    return response.user
  }, [])

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
