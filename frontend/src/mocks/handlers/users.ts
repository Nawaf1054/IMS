import { http } from 'msw'

import type { Role } from '@/types/models'

import { db, findUser, userView } from '../db'
import { API, fail, idParam, paginate, readBody, requireAdmin, route } from '../http'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ROLES: Role[] = ['admin', 'staff']

interface UserInput {
  name?: string
  email?: string
  role?: Role
  password?: string
  is_active?: boolean
}

function emailTaken(email: string, exceptId?: number) {
  return db.users.some((u) => u.id !== exceptId && u.email.toLowerCase() === email.toLowerCase())
}

export const userHandlers = [
  http.get(
    `${API}/users`,
    route(({ request, url }) => {
      requireAdmin(request)
      return paginate(db.users.map(userView), url)
    }),
  ),

  http.post(
    `${API}/users`,
    route(async ({ request }) => {
      requireAdmin(request)
      const input = await readBody<UserInput>(request)
      const name = input.name?.trim() ?? ''
      const email = input.email?.trim() ?? ''
      if (!name) fail(422, 'VALIDATION_ERROR', 'Enter the person’s name.')
      if (!EMAIL.test(email)) fail(422, 'VALIDATION_ERROR', 'Enter a valid email address.')
      if (emailTaken(email)) fail(409, 'EMAIL_TAKEN', 'A user with this email already exists.')
      if (!input.role || !ROLES.includes(input.role)) fail(422, 'VALIDATION_ERROR', 'Choose a role.')
      if ((input.password ?? '').length < 10) fail(422, 'WEAK_PASSWORD', 'Use at least 10 characters.')
      const user = {
        id: db.users.reduce((max, u) => Math.max(max, u.id), 0) + 1,
        name,
        email,
        role: input.role,
        is_active: true,
        password: input.password!,
        created_at: new Date().toISOString(),
        last_active_at: null,
      }
      db.users.push(user)
      return userView(user)
    }),
  ),

  http.patch(
    `${API}/users/:id`,
    route(async ({ request, params }) => {
      const admin = requireAdmin(request)
      const user = findUser(idParam(params))
      const input = await readBody<UserInput>(request)
      const isSelf = user.id === admin.id
      if (isSelf && input.is_active === false) fail(409, 'CANNOT_DEACTIVATE_SELF', 'You can’t deactivate your own account.')
      if (isSelf && input.role && input.role !== user.role) fail(409, 'CANNOT_CHANGE_OWN_ROLE', 'You can’t change your own role.')
      if (input.name !== undefined) {
        if (!input.name.trim()) fail(422, 'VALIDATION_ERROR', 'Enter the person’s name.')
        user.name = input.name.trim()
      }
      if (input.email !== undefined) {
        const email = input.email.trim()
        if (!EMAIL.test(email)) fail(422, 'VALIDATION_ERROR', 'Enter a valid email address.')
        if (emailTaken(email, user.id)) fail(409, 'EMAIL_TAKEN', 'A user with this email already exists.')
        user.email = email
      }
      if (input.role !== undefined) {
        if (!ROLES.includes(input.role)) fail(422, 'VALIDATION_ERROR', 'Choose a role.')
        user.role = input.role
      }
      if (input.is_active !== undefined) user.is_active = input.is_active
      return userView(user)
    }),
  ),
]
