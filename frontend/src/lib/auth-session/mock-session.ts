import { env } from '@/config/env'
import type { TokenPair } from '@/types/models'

import { networkError, toApiError } from '../api-error'
import { authStorage } from '../auth-storage'
import type { AuthSession } from './types'

async function post(path: string, body: unknown): Promise<Response> {
  try {
    return await fetch(`${env.apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw networkError()
  }
}

/** Sessions issued by the in-browser mock API (`/auth/login`, `/auth/refresh`), kept in localStorage. */
export function createMockSession(): AuthSession {
  return {
    hasStoredSession: () => authStorage.getAccessToken() !== null,

    async signIn(email, password) {
      const response = await post('/auth/login', { email, password })
      if (!response.ok) throw await toApiError(response)
      authStorage.setTokens((await response.json()) as TokenPair)
    },

    async signOut() {
      authStorage.clear()
    },

    async getAccessToken() {
      return authStorage.getAccessToken()
    },

    async refresh() {
      const refreshToken = authStorage.getRefreshToken()
      if (!refreshToken) return false
      try {
        const response = await post('/auth/refresh', { refresh_token: refreshToken })
        if (!response.ok) return false
        authStorage.setTokens((await response.json()) as TokenPair)
        return true
      } catch {
        return false
      }
    },
  }
}
