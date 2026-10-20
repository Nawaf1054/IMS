/**
 * HTTP client for the backend API: adds the access token, refreshes it once on 401,
 * and turns error responses into ApiError.
 */
import { env } from '@/config/env'

import { networkError, toApiError } from './api-error'
import { authSession } from './auth-session'

export { ApiError, isApiError } from './api-error'

/** Fired when the session can't be refreshed; the auth provider signs the user out. */
export const AUTH_EXPIRED_EVENT = 'ims:auth-expired'

type QueryValue = string | number | boolean | null | undefined
/** Query-string values; empty ones are left out of the URL. */
export type Query = Record<string, QueryValue>

/** Options for one request. */
interface RequestOptions {
  query?: Query
  body?: unknown
  signal?: AbortSignal
}

/** The full API URL for `path`, with non-empty query values encoded. */
function buildUrl(path: string, query?: Query): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return `${env.apiBaseUrl}${path}${qs ? `?${qs}` : ''}`
}

// One refresh at a time: concurrent 401s wait for the same attempt.
let refreshInFlight: Promise<boolean> | null = null

/** Refreshes the session, sharing one attempt between concurrent callers. */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= authSession.refresh().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

/**
 * Sends a request with the access token. On 401 it refreshes the token and retries once;
 * if that fails it signs out and tells the app (AUTH_EXPIRED_EVENT). Throws ApiError on failure.
 */
async function send(method: string, path: string, options: RequestOptions = {}, canRetry = true): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const token = await authSession.getAccessToken()
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
    throw networkError()
  }

  if (response.status === 401 && canRetry) {
    if (await refreshSession()) return send(method, path, options, false)
    await authSession.signOut()
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }

  if (!response.ok) throw await toApiError(response)
  return response
}

/** Sends a request and parses the JSON body (undefined for 204 No Content). */
async function json<T>(method: string, path: string, options?: RequestOptions): Promise<T> {
  const response = await send(method, path, options)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** The file name from a Content-Disposition header, or `fallback`. */
function filenameFrom(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition)
  return match ? decodeURIComponent(match[1]) : fallback
}

/** Typed helpers for each HTTP method; every feature's API module uses these. */
export const apiClient = {
  /** GET with optional query parameters. */
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => json<T>('GET', path, { query, signal }),
  /** POST with a JSON body. */
  post: <T>(path: string, body?: unknown) => json<T>('POST', path, { body: body ?? {} }),
  /** PATCH with a JSON body. */
  patch: <T>(path: string, body: unknown) => json<T>('PATCH', path, { body }),
  /** DELETE. */
  delete: <T = void>(path: string) => json<T>('DELETE', path),

  /** Fetches a file (Excel export, invoice PDF) and returns it with its server-side filename. */
  async download(path: string, query: Query | undefined, fallbackName: string) {
    const response = await send('GET', path, { query })
    return { blob: await response.blob(), filename: filenameFrom(response, fallbackName) }
  },
}
