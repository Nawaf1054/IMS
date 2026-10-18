import { http } from 'msw'

import type { LoginResponse, TokenPair } from '@/types/models'

import { db, userView } from '../db'
import { API, fail, readBody, requireUser, route, tokens } from '../http'

export const authHandlers = [
  http.post(
    `${API}/auth/login`,
    route(async ({ request }): Promise<LoginResponse> => {
      const { email = '', password = '' } = await readBody<{ email?: string; password?: string }>(request)
      const user = db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase())
      if (!user || user.password !== password) fail(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')
      if (!user.is_active) fail(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated. Ask an admin to reactivate it.')
      user.last_active_at = new Date().toISOString()
      return { access_token: tokens.access(user.id), refresh_token: tokens.refresh(user.id), token_type: 'bearer', user: userView(user) }
    }),
  ),

  http.post(
    `${API}/auth/refresh`,
    route(async ({ request }): Promise<TokenPair> => {
      const { refresh_token = null } = await readBody<{ refresh_token?: string }>(request)
      const userId = tokens.userId(refresh_token, 'refresh')
      const user = userId ? db.users.find((u) => u.id === userId && u.is_active) : undefined
      if (!user) fail(401, 'INVALID_REFRESH_TOKEN', 'Your session has ended. Sign in again.')
      return { access_token: tokens.access(user.id), refresh_token: tokens.refresh(user.id), token_type: 'bearer' }
    }),
  ),

  http.get(
    `${API}/auth/me`,
    route(({ request }) => userView(requireUser(request))),
  ),
]
