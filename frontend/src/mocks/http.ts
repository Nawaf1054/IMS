/** Request/response plumbing shared by the mock handlers. */
import { delay, HttpResponse } from 'msw'

import type { ApiErrorBody, Page } from '@/types/api'

import type { UserRow } from './data/seed'
import { db } from './db'
import { fail, MockApiError } from './errors'

export { fail }

/** Matches the API on any origin, so VITE_API_BASE_URL can be relative or absolute. */
export const API = '*/api/v1'

type Params = Record<string, string | readonly string[] | undefined>

interface RouteContext {
  request: Request
  params: Params
  url: URL
}

/**
 * Wraps a handler body: adds realistic latency and turns MockApiError into the
 * backend's `{ detail, code }` error format. Returning a Response passes it through.
 */
export function route(fn: (ctx: RouteContext) => unknown | Promise<unknown>) {
  return async ({ request, params }: { request: Request; params: Params }) => {
    if (import.meta.env.MODE !== 'test') await delay(150 + Math.random() * 250)
    try {
      const result = await fn({ request, params, url: new URL(request.url) })
      if (result instanceof Response) return result
      if (result === undefined) return new HttpResponse(null, { status: 204 })
      return HttpResponse.json(result as Record<string, unknown>)
    } catch (error) {
      if (error instanceof MockApiError) {
        return HttpResponse.json<ApiErrorBody>({ detail: error.message, code: error.code }, { status: error.status })
      }
      console.error('[mock api]', error)
      return HttpResponse.json<ApiErrorBody>({ detail: 'Unexpected server error.', code: 'INTERNAL_ERROR' }, { status: 500 })
    }
  }
}

export function idParam(params: Params, key = 'id'): number {
  const id = Number(params[key])
  if (!Number.isInteger(id)) fail(404, 'NOT_FOUND', 'Not found.')
  return id
}

export async function readBody<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    fail(422, 'VALIDATION_ERROR', 'Request body must be valid JSON.')
  }
}

// ── Auth (AUTH-3, AUTH-4: enforced on every protected route) ───────────────

export const tokens = {
  access: (userId: number) => `mock-access.${userId}.${Date.now()}`,
  refresh: (userId: number) => `mock-refresh.${userId}.${Date.now()}`,
  userId(token: string | null, kind: 'access' | 'refresh'): number | null {
    const match = token && new RegExp(`^mock-${kind}\\.(\\d+)\\.`).exec(token)
    return match ? Number(match[1]) : null
  },
}

export function requireUser(request: Request): UserRow {
  const header = request.headers.get('Authorization')
  const userId = tokens.userId(header?.replace(/^Bearer\s+/i, '') ?? null, 'access')
  const user = userId ? db.users.find((u) => u.id === userId) : undefined
  if (!user || !user.is_active) fail(401, 'NOT_AUTHENTICATED', 'Your session has ended. Sign in again.')
  return user
}

export function requireAdmin(request: Request): UserRow {
  const user = requireUser(request)
  if (user.role !== 'admin') fail(403, 'FORBIDDEN', 'Only admins can do this.')
  return user
}

// ── Lists ───────────────────────────────────────────────────────────────────

export function pageParams(url: URL) {
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('page_size')) || 20))
  return { page, pageSize }
}

export function paginate<T>(items: T[], url: URL): Page<T> {
  const { page, pageSize } = pageParams(url)
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize }
}

/** Inclusive ISO-date range check against an ISO timestamp, in local business time. */
export function inDateRange(timestamp: string, start: string | null, end: string | null): boolean {
  const d = new Date(timestamp)
  const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return (!start || local >= start) && (!end || local <= end)
}

export function fileResponse(body: BodyInit, filename: string, contentType: string): Response {
  return new HttpResponse(body, {
    headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${filename}"` },
  })
}
