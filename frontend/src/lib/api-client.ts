import { env } from '@/config/env'
import type { ApiErrorBody } from '@/types/api'

import { authStorage } from './auth-storage'

/** Fired when the session can't be refreshed; the auth provider signs the user out. */
export const AUTH_EXPIRED_EVENT = 'ims:auth-expired'

/** Every failed request surfaces as an ApiError carrying the backend's `{ detail, code }`. */
export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, body: ApiErrorBody) {
    super(body.detail)
    this.name = 'ApiError'
    this.status = status
    this.code = body.code
  }
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code)
}

type QueryValue = string | number | boolean | null | undefined
export type Query = Record<string, QueryValue>

interface RequestOptions {
  query?: Query
  body?: unknown
  signal?: AbortSignal
}

const PUBLIC_PATHS = new Set(['/auth/login', '/auth/refresh'])

function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return `${env.apiBaseUrl}${path}${qs ? `?${qs}` : ''}`
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>
    return new ApiError(response.status, {
      detail: body.detail ?? response.statusText,
      code: body.code ?? 'HTTP_ERROR',
    })
  } catch {
    return new ApiError(response.status, { detail: response.statusText || 'Request failed', code: 'HTTP_ERROR' })
  }
}

// One refresh at a time: concurrent 401s wait for the same attempt.
let refreshInFlight: Promise<boolean> | null = null

function refreshSession(): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refreshToken = authStorage.getRefreshToken()
    if (!refreshToken) return false
    try {
      const response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!response.ok) return false
      authStorage.setTokens(await response.json())
      return true
    } catch {
      return false
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

async function send(method: string, path: string, options: RequestOptions = {}, canRetry = true): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = authStorage.getAccessToken()
  if (token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, { detail: 'Can’t reach the server. Check your connection and try again.', code: 'NETWORK_ERROR' })
  }

  if (response.status === 401 && canRetry && !PUBLIC_PATHS.has(path)) {
    if (await refreshSession()) return send(method, path, options, false)
    authStorage.clear()
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }

  if (!response.ok) throw await toApiError(response)
  return response
}

async function json<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
  const response = await send(method, path, options)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

function filenameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  return match ? decodeURIComponent(match[1]) : fallback
}

export const apiClient = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => json<T>('GET', path, { query, signal }),
  post: <T>(path: string, body?: unknown) => json<T>('POST', path, { body: body ?? {} }),
  patch: <T>(path: string, body: unknown) => json<T>('PATCH', path, { body }),
  delete: <T = void>(path: string) => json<T>('DELETE', path),

  /** Fetches a file (Excel export, invoice PDF) and returns it with its server-side filename. */
  async download(path: string, query: Query | undefined, fallbackName: string) {
    const response = await send('GET', path, { query })
    return { blob: await response.blob(), filename: filenameFrom(response, fallbackName) }
  },
}
